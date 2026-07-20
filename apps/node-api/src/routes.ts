import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "@repo/db";
import { requireAuth } from "./auth";
import { hashMessageAsync } from "./lib/blockchain-hash";
import { sendMail, getInviteEmailTemplate } from "./lib/mail";
import { runAndEmailAudit } from "./lib/audit";
import { blockchainLogger } from "./lib/blockchain";
import { localBlockchain } from "./lib/local-blockchain";
import { normalizeImageBase64 } from "./lib/steganography";
import { broadcastMessage, broadcastMessageUpdate, isUserLive, getOnlineUsersForServer, getActiveRoomPeers } from "./socket";
import { unpinFromPinata, unpinMultipleFromPinata } from "./lib/pinata";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import crypto from "crypto";
import bs58 from "bs58";
import { ethers } from "ethers";

const nonces = new Map<string, { nonce: string; expires: number }>();


const MESSAGE_BATCH = 10;

type AppEnv = {
    Variables: {
        userId: string;
    };
};

const memberInclude = {
    include: {
        profile: true,
    },
} as const;

export function createApp(io: SocketIOServer) {
    const app = new Hono<AppEnv>();

    app.use(
        "*",
        cors({
            // Reflect the request origin instead of wildcard '*'.
            // Wildcard is incompatible with credentials:true per the CORS spec.
            origin: (origin) => origin ?? "*",
            allowHeaders: ["Authorization", "Content-Type", "X-User-Id", "Cookie"],
            allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            credentials: true,
        }),
    );

    app.get("/health", async (c) => {
        return c.json({
            status: "ok",
            blockchain: { connected: true, mode: "client-side-indexeddb", decentralized: true },
            connected_users: 0,
        });
    });

    // ── Decentralized Wallet Authentication ──────────────────────────────────────
    app.post("/api/profile/nonce", async (c) => {
        try {
            const body = await c.req.json<{ address: string }>();
            const address = body.address?.trim();
            if (!address) {
                return c.json({ error: "Wallet address is required" }, 400);
            }

            const nonce = `Nexus Authentication Challenge: Sign this message to prove ownership of your wallet. Nonce: ${crypto.randomUUID()}`;
            const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

            nonces.set(address.toLowerCase(), { nonce, expires });

            return c.json({ nonce });
        } catch (error) {
            console.error("[nonce] Error:", error);
            return c.json({ error: "Failed to generate challenge" }, 500);
        }
    });

    app.post("/api/profile/verify", async (c) => {
        try {
            const body = await c.req.json<{
                address: string;
                signature: string;
                walletType: "evm" | "solana";
            }>();

            const address = body.address?.trim();
            const signature = body.signature?.trim();
            const walletType = body.walletType;

            if (!address || !signature || !walletType) {
                return c.json({ error: "address, signature, and walletType are required" }, 400);
            }

            // Retrieve expected challenge
            const cached = nonces.get(address.toLowerCase());
            if (!cached) {
                return c.json({ error: "Challenge not found or expired. Request a new nonce." }, 400);
            }

            if (Date.now() > cached.expires) {
                nonces.delete(address.toLowerCase());
                return c.json({ error: "Challenge expired. Request a new nonce." }, 400);
            }

            const nonce = cached.nonce;
            let isValid = false;

            if (walletType === "evm") {
                try {
                    const recovered = ethers.verifyMessage(nonce, signature);
                    isValid = recovered.toLowerCase() === address.toLowerCase();
                    console.log(`[verify] EVM: address=${address}, recovered=${recovered}, isValid=${isValid}`);
                } catch (e: any) {
                    console.error("MetaMask verification error:", e.message || e, e);
                }
            } else if (walletType === "solana") {
                try {
                    const messageBuffer = Buffer.from(nonce, "utf-8");
                    const signatureBuffer = Buffer.from(bs58.decode(signature));
                    const publicKeyBuffer = Buffer.from(bs58.decode(address));

                    // Prepend standard SPKI Ed25519 OID header to the raw 32-byte public key buffer
                    const spkiHeader = Buffer.from("302a300506032b6570032100", "hex");
                    const derBuffer = Buffer.concat([spkiHeader, publicKeyBuffer]);

                    const keyObject = crypto.createPublicKey({
                        key: derBuffer,
                        format: "der",
                        type: "spki",
                    });

                    isValid = crypto.verify(
                        null,
                        messageBuffer,
                        keyObject,
                        signatureBuffer
                    );
                    console.log(`[verify] Solana: address=${address}, isValid=${isValid}`);
                } catch (e: any) {
                    console.error("Solana verification error:", e.message || e, e);
                }
            } else {
                return c.json({ error: "Unsupported wallet type" }, 400);
            }

            if (!isValid) {
                console.log(`[verify] Verification failed. Nonce was: "${nonce}"`);
                return c.json({ error: "Invalid signature" }, 400);
            }

            // Signature is valid. Clear nonce
            nonces.delete(address.toLowerCase());

            // Get or create database Profile
            let profile = await prisma.profile.findUnique({
                where: { userId: address },
            });

            if (!profile) {
                const shortName = walletType === "evm"
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : `${address.slice(0, 4)}...${address.slice(-4)}`;

                profile = await prisma.profile.create({
                    data: {
                        userId: address,
                        name: walletType === "evm" ? `EVM-${shortName}` : `Solana-${shortName}`,
                        imageUrl: `https://ui-avatars.com/api/?name=${shortName}&background=6366f1&color=fff`,
                        email: "",
                    },
                });
            }

            // Generate custom JWT token
            const JWT_SECRET = process.env.JWT_SECRET || "nexus-fallback-secret-key-321";
            const token = await sign(
                {
                    sub: address,
                    iat: Math.floor(Date.now() / 1000),
                    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days session
                },
                JWT_SECRET
            );

            // Set session token in cookie
            setCookie(c, "__session", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 7 * 24 * 60 * 60,
                sameSite: "Lax",
            });

            return c.json({ success: true, profile });
        } catch (error) {
            console.error("[verify] Error:", error);
            return c.json({ error: "Authentication failed" }, 500);
        }
    });

    app.post("/api/profile/logout", async (c) => {
        setCookie(c, "__session", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 0,
            sameSite: "Lax",
        });
        return c.json({ success: true });
    });

    app.get("/api/profile/active-peers", requireAuth, async (c) => {
        const roomId = c.req.query("roomId");
        if (!roomId) return c.json({ error: "roomId required" }, 400);

        const peers = getActiveRoomPeers(roomId);
        const userIds = peers.map(p => p.userId).filter(Boolean) as string[];

        const profiles = await prisma.profile.findMany({
            where: {
                userId: { in: userIds }
            }
        });

        return c.json(profiles);
    });

    // ── Messages ──────────────────────────────────────────────────
    app.get("/api/messages", requireAuth, async (c) => {
        const channelId = c.req.query("channelId");
        const cursor = c.req.query("cursor");
        if (!channelId) {
            return c.json({ error: "channelId is required" }, 400);
        }

        const cursorMessage = cursor
            ? await prisma.message.findUnique({
                  where: { id: cursor },
                  select: { createdAt: true },
              })
            : null;

        const items = await prisma.message.findMany({
            where: {
                channelId,
                ...(cursorMessage
                    ? { createdAt: { lt: cursorMessage.createdAt } }
                    : {}),
            },
            include: { member: memberInclude },
            orderBy: { createdAt: "desc" },
            take: MESSAGE_BATCH + 1,
        });

        let nextCursor: string | null = null;
        const page = items.length > MESSAGE_BATCH ? items.slice(0, MESSAGE_BATCH) : items;
        if (items.length > MESSAGE_BATCH) {
            nextCursor = page[page.length - 1]?.id ?? null;
        }

        // Messages stored as client-encrypted blobs â€” server does NOT decrypt
        for (const item of page) {
            if (item.content) {
                // Hash the raw (still-encrypted) content for blockchain integrity check
                (item as any).blockchainHash = await hashMessageAsync(item.content);
            }
        }

        return c.json({ items: page, nextCursor });
    });

    app.post("/api/messages", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const channelId = c.req.query("channelId");
        const serverId = c.req.query("serverId");
        const body = await c.req.json<{ content?: string; fileUrl?: string }>();
        const content = body.content ?? "";
        const fileUrl = body.fileUrl;

        if (!content && !fileUrl) {
            return c.json({ error: "Content is required" }, 400);
        }
        if (!channelId) {
            return c.json({ error: "channelId is required" }, 400);
        }

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
            return c.json({ error: "Channel not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: {
                profileId: profile.id,
                serverId: serverId ?? channel.serverId,
            },
        });
        if (!member) {
            return c.json({ error: "Not a member of this server" }, 403);
        }

        // Content arrives pre-encrypted from the client (v2 client crypto)
        // Server stores it as-is without re-encrypting
        const bcHash = await hashMessageAsync(content);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour self-destruct TTL

        const message = await prisma.message.create({
            data: {
                content: content, // stored as client-encrypted ciphertext
                memberId: member.id,
                channelId,
                fileUrl: fileUrl ?? null,
                expiresAt,
            },
            include: { member: memberInclude },
        });

        broadcastMessage(io, channelId, message);

        // Log to PoW blockchain ledger in the background (non-blocking)
        // Swallow errors — an offline OrbitDB node must NOT break message creation.
        blockchainLogger.logMessageBackground(
            profile.name ?? userId,
            channelId,
            content,
            channelId,
        ).catch((err) => console.warn("[Blockchain] Failed to log channel message (non-fatal):", err?.message));

        // Notify other server members
        const resolvedServerId = serverId ?? channel.serverId;
        const serverMembers = await prisma.member.findMany({
            where: { serverId: resolvedServerId },
            include: { profile: true },
        });

        for (const m of serverMembers) {
            if (m.profile.userId !== userId) {
                io.to(`user:${m.profile.userId}`).emit("message:new", {
                    type: "channel",
                    serverId: resolvedServerId,
                    channelId,
                    message,
                });
            }
        }

        return c.json({ ...message, blockchainHash: bcHash });
    });

    app.delete("/api/messages/:messageId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const messageId = c.req.param("messageId");
        const channelId = c.req.query("channelId");
        const serverId = c.req.query("serverId");

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const existing = await prisma.message.findUnique({
            where: { id: messageId },
            include: { member: memberInclude },
        });
        if (!existing) {
            return c.json({ error: "Message not found" }, 404);
        }

        const resolvedChannelId = channelId ?? existing.channelId;
        const isAuthor = existing.member.profile.userId === userId;
        if (!isAuthor) {
            const requester = await prisma.member.findFirst({
                where: {
                    profileId: profile.id,
                    serverId: serverId ?? existing.member.serverId,
                },
            });
            if (!requester || requester.role === "GUEST") {
                return c.json({ error: "Not authorized" }, 403);
            }
        }

        if (existing.fileUrl) {
            unpinFromPinata(existing.fileUrl).catch((err) =>
                console.error("[Pinata] Error unpinning message attachment:", err)
            );
        }

        const message = await prisma.message.update({
            where: { id: messageId },
            data: {
                content: "This message has been deleted.",
                deleted: true,
                fileUrl: null,
            },
            include: { member: memberInclude },
        });

        broadcastMessageUpdate(io, resolvedChannelId, message);
        return c.json(message);
    });

    // â”€â”€ Direct messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.get("/api/direct-messages", requireAuth, async (c) => {
        const conversationId = c.req.query("conversationId");
        const cursor = c.req.query("cursor");
        if (!conversationId) {
            return c.json({ error: "conversationId is required" }, 400);
        }

        const cursorMessage = cursor
            ? await prisma.directMessage.findUnique({
                  where: { id: cursor },
                  select: { createdAt: true },
              })
            : null;

        const items = await prisma.directMessage.findMany({
            where: {
                conversationId,
                ...(cursorMessage
                    ? { createdAt: { lt: cursorMessage.createdAt } }
                    : {}),
            },
            include: { member: memberInclude },
            orderBy: { createdAt: "desc" },
            take: MESSAGE_BATCH + 1,
        });

        let nextCursor: string | null = null;
        const page = items.length > MESSAGE_BATCH ? items.slice(0, MESSAGE_BATCH) : items;
        if (items.length > MESSAGE_BATCH) {
            nextCursor = page[page.length - 1]?.id ?? null;
        }

        // Messages stored as client-encrypted blobs â€” server does NOT decrypt
        for (const item of page) {
            if (item.content) {
                (item as any).blockchainHash = await hashMessageAsync(item.content);
            }
        }

        return c.json({ items: page, nextCursor });
    });

    app.post("/api/direct-messages", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const conversationId = c.req.query("conversationId");
        const body = await c.req.json<{
            content?: string;
            fileUrl?: string;
            memberId?: string;
        }>();
        const content = body.content ?? "";
        const fileUrl = body.fileUrl;

        if (!content && !fileUrl) {
            return c.json({ error: "Content is required" }, 400);
        }
        if (!conversationId) {
            return c.json({ error: "conversationId is required" }, 400);
        }

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        let memberId = body.memberId;
        if (!memberId) {
            const member = await prisma.member.findFirst({
                where: { profileId: profile.id },
            });
            memberId = member?.id;
        }
        if (!memberId) {
            return c.json({ error: "Member not found" }, 404);
        }

        // Content arrives pre-encrypted from the client (v2 client crypto)
        const bcHash = await hashMessageAsync(content);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour self-destruct TTL

        const message = await prisma.directMessage.create({
            data: {
                content: content, // stored as client-encrypted ciphertext
                memberId,
                conversationId,
                fileUrl: fileUrl ?? null,
                expiresAt,
            },
            include: { member: memberInclude },
        });

        broadcastMessage(io, conversationId, message);

        // Notify recipient of Direct Message
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                memberOne: { include: { profile: true } },
                memberTwo: { include: { profile: true } },
            },
        });

        if (conversation) {
            const recipient = conversation.memberOne.profile.userId === userId
                ? conversation.memberTwo
                : conversation.memberOne;

            io.to(`user:${recipient.profile.userId}`).emit("message:new", {
                type: "conversation",
                serverId: null,
                conversationId,
                message,
            });
        }

        // Log to PoW blockchain ledger in the background (non-blocking)
        // Swallow errors — an offline OrbitDB node must NOT break DM creation.
        blockchainLogger.logMessageBackground(
            userId,
            conversationId,
            content,
            conversationId,
        ).catch((err) => console.warn("[Blockchain] Failed to log DM (non-fatal):", err?.message));

        return c.json({ ...message, blockchainHash: bcHash });
    });

    app.delete("/api/direct-messages/:messageId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const messageId = c.req.param("messageId");
        const conversationId = c.req.query("conversationId");

        const existing = await prisma.directMessage.findUnique({
            where: { id: messageId },
            include: { member: memberInclude },
        });
        if (!existing) {
            return c.json({ error: "Message not found" }, 404);
        }

        if (existing.member.profile.userId !== userId) {
            return c.json({ error: "Not authorized" }, 403);
        }

        const convId = conversationId ?? existing.conversationId;

        if (existing.fileUrl) {
            unpinFromPinata(existing.fileUrl).catch((err) =>
                console.error("[Pinata] Error unpinning direct message attachment:", err)
            );
        }

        const message = await prisma.directMessage.update({
            where: { id: messageId },
            data: {
                content: "This message has been deleted.",
                deleted: true,
                fileUrl: null,
            },
            include: { member: memberInclude },
        });

        broadcastMessageUpdate(io, convId, message);
        return c.json(message);
    });

    // â”€â”€ Servers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.get("/api/servers", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const servers = await prisma.server.findMany({
            where: { members: { some: { profileId: profile.id } } },
            orderBy: { createdAt: "asc" },
        });
        return c.json(servers);
    });

    app.post("/api/servers", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{ name?: string; imageUrl?: string }>();
        if (!body.name) {
            return c.json({ error: "Server name is required" }, 400);
        }

        let profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            profile = await prisma.profile.create({
                data: {
                    userId,
                    name: `User-${userId.slice(0, 8)}`,
                    imageUrl: "",
                    email: "",
                },
            });
        }

        const server = await prisma.$transaction(async (tx) => {
            const created = await tx.server.create({
                data: {
                    name: body.name!,
                    imageUrl: body.imageUrl ?? "",
                    inviteCode: crypto.randomUUID().slice(0, 8),
                    profileId: profile!.id,
                },
            });

            await tx.channel.create({
                data: {
                    name: "general",
                    type: "TEXT",
                    profileId: profile!.id,
                    serverId: created.id,
                },
            });

            await tx.member.create({
                data: {
                    role: "ADMIN",
                    profileId: profile!.id,
                    serverId: created.id,
                },
            });

            return created;
        });

        const details = await prisma.server.findUnique({
            where: { id: server.id },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });

        return c.json(details, 201);
    });

    app.get("/api/servers/:serverId", requireAuth, async (c) => {
        const server = await prisma.server.findUnique({
            where: { id: c.req.param("serverId") },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        if (!server) {
            return c.json({ error: "Server not found" }, 404);
        }
        return c.json(server);
    });

    app.patch("/api/servers/:serverId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const serverId = c.req.param("serverId");
        const body = await c.req.json<{ name?: string; imageUrl?: string }>();

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId },
        });
        if (!member || !["ADMIN", "MODERATOR"].includes(member.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }

        await prisma.server.update({
            where: { id: serverId },
            data: {
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
            },
        });

        const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        return c.json(server);
    });

    app.delete("/api/servers/:serverId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const serverId = c.req.param("serverId");

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId },
        });
        if (!member || member.role !== "ADMIN") {
            return c.json({ error: "Not authorized" }, 403);
        }

        const serverMsgs = await prisma.message.findMany({
            where: { channel: { serverId }, fileUrl: { not: null } },
            select: { fileUrl: true },
        });
        if (serverMsgs.length > 0) {
            await unpinMultipleFromPinata(serverMsgs.map((m) => m.fileUrl));
        }

        await prisma.server.delete({ where: { id: serverId } });
        return c.json({ success: true });
    });

    app.patch("/api/servers/:serverId/invite-code", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const serverId = c.req.param("serverId");

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId },
        });
        if (!member || !["ADMIN", "MODERATOR"].includes(member.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }

        await prisma.server.update({
            where: { id: serverId },
            data: { inviteCode: crypto.randomUUID().slice(0, 8) },
        });

        const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        return c.json(server);
    });

    app.post("/api/servers/join", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{ inviteCode?: string }>();
        if (!body.inviteCode) {
            return c.json({ error: "Invite code is required" }, 400);
        }

        const server = await prisma.server.findUnique({
            where: { inviteCode: body.inviteCode },
        });
        if (!server) {
            return c.json({ error: "Invalid invite code" }, 404);
        }

        let profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            profile = await prisma.profile.create({
                data: {
                    userId,
                    name: `User-${userId.slice(0, 8)}`,
                    imageUrl: "",
                    email: "",
                },
            });
        }

        const existing = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId: server.id },
        });
        if (!existing) {
            await prisma.member.create({
                data: {
                    profileId: profile.id,
                    serverId: server.id,
                    role: "GUEST",
                },
            });
        }

        const details = await prisma.server.findUnique({
            where: { id: server.id },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        return c.json(details);
    });

    // â”€â”€ Channels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.post("/api/channels", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{
            name?: string;
            type?: "TEXT" | "AUDIO" | "VIDEO";
            serverId?: string;
        }>();

        // serverId is sent as a query param by the frontend (?serverId=...)
        // but may also arrive in the body â€” support both
        const serverId = c.req.query("serverId") || body.serverId;

        if (!body.name) {
            return c.json({ error: "Channel name is required" }, 400);
        }
        if (!serverId) {
            return c.json({ error: "serverId is required" }, 400);
        }
        if (body.name.toLowerCase() === "general") {
            return c.json({ error: "Channel name cannot be 'general'" }, 400);
        }

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId: serverId },
        });
        if (!member || !["ADMIN", "MODERATOR"].includes(member.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }

        const channel = await prisma.channel.create({
            data: {
                name: body.name,
                type: body.type ?? "TEXT",
                profileId: profile.id,
                serverId: serverId,
            },
        });
        return c.json(channel, 201);
    });

    app.get("/api/channels/:channelId", requireAuth, async (c) => {
        const channel = await prisma.channel.findUnique({
            where: { id: c.req.param("channelId") },
        });
        if (!channel) {
            return c.json({ error: "Channel not found" }, 404);
        }
        return c.json(channel);
    });

    app.patch("/api/channels/:channelId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const channelId = c.req.param("channelId");
        const serverId = c.req.query("serverId");
        const body = await c.req.json<{ name?: string; type?: string }>();

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
            return c.json({ error: "Channel not found" }, 404);
        }

        if (body.name?.toLowerCase() === "general") {
            return c.json({ error: "Cannot rename to 'general'" }, 400);
        }

        const member = await prisma.member.findFirst({
            where: {
                profileId: profile.id,
                serverId: serverId ?? channel.serverId,
            },
        });
        if (!member || !["ADMIN", "MODERATOR"].includes(member.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }

        const updated = await prisma.channel.update({
            where: { id: channelId },
            data: {
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.type !== undefined
                    ? { type: body.type as "TEXT" | "AUDIO" | "VIDEO" }
                    : {}),
            },
        });
        return c.json(updated);
    });

    app.delete("/api/channels/:channelId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const channelId = c.req.param("channelId");
        const serverId = c.req.query("serverId");

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const channel = await prisma.channel.findUnique({ where: { id: channelId } });
        if (!channel) {
            return c.json({ error: "Channel not found" }, 404);
        }
        if (channel.name.toLowerCase() === "general") {
            return c.json({ error: "Cannot delete the general channel" }, 400);
        }

        const member = await prisma.member.findFirst({
            where: {
                profileId: profile.id,
                serverId: serverId ?? channel.serverId,
            },
        });
        if (!member || !["ADMIN", "MODERATOR"].includes(member.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }

        const channelMsgs = await prisma.message.findMany({
            where: { channelId, fileUrl: { not: null } },
            select: { fileUrl: true },
        });
        if (channelMsgs.length > 0) {
            await unpinMultipleFromPinata(channelMsgs.map((m) => m.fileUrl));
        }

        await prisma.channel.delete({ where: { id: channelId } });
        return c.json({ success: true });
    });

    // â”€â”€ Members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.patch("/api/members/:memberId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const memberId = c.req.param("memberId");
        const serverId = c.req.query("serverId");
        const body = await c.req.json<{ role?: string }>();

        if (!body.role || !["ADMIN", "MODERATOR", "GUEST"].includes(body.role)) {
            return c.json({ error: "Invalid role" }, 400);
        }

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const target = await prisma.member.findUnique({
            where: { id: memberId },
        });
        if (!target) {
            return c.json({ error: "Member not found" }, 404);
        }

        const requester = await prisma.member.findFirst({
            where: {
                profileId: profile.id,
                serverId: serverId ?? target.serverId,
            },
        });
        if (!requester || requester.role !== "ADMIN") {
            return c.json({ error: "Not authorized" }, 403);
        }

        await prisma.member.update({
            where: { id: memberId },
            data: { role: body.role as "ADMIN" | "MODERATOR" | "GUEST" },
        });

        const server = await prisma.server.findUnique({
            where: { id: serverId ?? target.serverId },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        return c.json(server);
    });

    app.delete("/api/members/:memberId", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const memberId = c.req.param("memberId");
        const serverId = c.req.query("serverId");

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const target = await prisma.member.findUnique({
            where: { id: memberId },
        });
        if (!target) {
            return c.json({ error: "Member not found" }, 404);
        }

        const requester = await prisma.member.findFirst({
            where: {
                profileId: profile.id,
                serverId: serverId ?? target.serverId,
            },
        });
        if (!requester || !["ADMIN", "MODERATOR"].includes(requester.role)) {
            return c.json({ error: "Not authorized" }, 403);
        }
        if (memberId === requester.id) {
            return c.json({ error: "Cannot kick yourself" }, 400);
        }

        const [memberMsgs, memberDMs] = await Promise.all([
            prisma.message.findMany({
                where: { memberId, fileUrl: { not: null } },
                select: { fileUrl: true },
            }),
            prisma.directMessage.findMany({
                where: { memberId, fileUrl: { not: null } },
                select: { fileUrl: true },
            }),
        ]);
        const fileUrlsToUnpin = [
            ...memberMsgs.map((m) => m.fileUrl),
            ...memberDMs.map((d) => d.fileUrl),
        ];
        if (fileUrlsToUnpin.length > 0) {
            await unpinMultipleFromPinata(fileUrlsToUnpin);
        }

        await prisma.member.delete({ where: { id: memberId } });

        const server = await prisma.server.findUnique({
            where: { id: serverId ?? target.serverId },
            include: {
                channels: { orderBy: { createdAt: "asc" } },
                members: { include: { profile: true }, orderBy: { role: "asc" } },
            },
        });
        return c.json(server);
    });

    app.post("/api/members/leave", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{ serverId?: string }>();
        if (!body.serverId) {
            return c.json({ error: "serverId is required" }, 400);
        }

        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }

        const member = await prisma.member.findFirst({
            where: { profileId: profile.id, serverId: body.serverId },
        });
        if (!member) {
            return c.json({ error: "Not a member" }, 404);
        }
        if (member.role === "ADMIN") {
            return c.json(
                { error: "Admin cannot leave. Transfer ownership first." },
                400,
            );
        }

        await prisma.member.delete({ where: { id: member.id } });
        return c.json({ success: true });
    });

    app.post("/api/conversations", requireAuth, async (c) => {
        const body = await c.req.json<{
            memberOneId?: string;
            memberTwoId?: string;
        }>();
        if (!body.memberOneId || !body.memberTwoId) {
            return c.json({ error: "memberOneId and memberTwoId required" }, 400);
        }

        const existing = await prisma.conversation.findFirst({
            where: {
                OR: [
                    {
                        memberOneId: body.memberOneId,
                        memberTwoId: body.memberTwoId,
                    },
                    {
                        memberOneId: body.memberTwoId,
                        memberTwoId: body.memberOneId,
                    },
                ],
            },
        });
        if (existing) {
            return c.json(existing);
        }

        const conversation = await prisma.conversation.create({
            data: {
                memberOneId: body.memberOneId,
                memberTwoId: body.memberTwoId,
            },
        });
        return c.json(conversation);
    });

    // â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.post("/api/profile/setup", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{
            name?: string;
            imageUrl?: string;
            email?: string;
        }>();

        const profile = await prisma.profile.upsert({
            where: { userId },
            create: {
                userId,
                name: body.name ?? `User-${userId.slice(0, 8)}`,
                imageUrl: body.imageUrl ?? "",
                email: body.email ?? "",
            },
            update: {
                name: body.name ?? undefined,
                imageUrl: body.imageUrl ?? undefined,
                email: body.email ?? undefined,
            },
        });
        return c.json(profile);
    });

    app.get("/api/profile", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) {
            return c.json({ error: "Profile not found" }, 404);
        }
        return c.json(profile);
    });

    // â”€â”€ Blockchain & users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    app.get("/api/blockchain/status", async (c) => {
        try {
            const status = await blockchainLogger.getChainStatus();
            return c.json({ ...status, mode: "decentralized-orbitdb" });
        } catch (error) {
            return c.json({ error: "Failed to get blockchain status" }, 500);
        }
    });

    app.post("/api/blockchain/mine", requireAuth, async (c) => {
        try {
            const block = await blockchainLogger.minePending();
            if (block) {
                return c.json({ success: true, block });
            }
            return c.json({ success: false, message: "No pending transactions in blockchain ledger" });
        } catch (error) {
            return c.json({ error: "Mining failed" }, 500);
        }
    });

    // ── Internal: purge self-destruct messages ────────────────────────────────────
    // Hard-deletes ALL messages/DMs that have a self-destruct TTL (expiresAt IS NOT NULL).
    app.get("/api/internal/purge-expired", async (c) => {
        const secret = c.req.header("X-Internal-Secret");
        const expectedSecret = process.env.INTERNAL_SECRET ?? "nexus-internal";
        if (secret !== expectedSecret) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const now = new Date();

        try {
            const [expiredMsgs, expiredDMs] = await Promise.all([
                prisma.message.findMany({
                    where: { expiresAt: { lte: now }, fileUrl: { not: null } },
                    select: { fileUrl: true },
                }),
                prisma.directMessage.findMany({
                    where: { expiresAt: { lte: now }, fileUrl: { not: null } },
                    select: { fileUrl: true },
                }),
            ]);
            const fileUrls = [
                ...expiredMsgs.map((m) => m.fileUrl),
                ...expiredDMs.map((d) => d.fileUrl),
            ];
            if (fileUrls.length > 0) {
                await unpinMultipleFromPinata(fileUrls);
            }
        } catch (err) {
            console.error("[internal-purge] Failed to unpin expired files:", err);
        }

        const [deletedMessages, deletedDMs] = await Promise.all([
            prisma.message.deleteMany({
                where: { expiresAt: { lte: now } }, // ONLY messages whose 24h TTL has passed
            }),
            prisma.directMessage.deleteMany({
                where: { expiresAt: { lte: now } }, // ONLY DMs whose 24h TTL has passed
            }),
        ]);

        try {
            await blockchainLogger.pruneExpiredData();
        } catch (err) {
            console.error("[internal-purge] Blockchain pruning failed:", err);
        }

        console.log(
            `[purge-expired] Deleted ${deletedMessages.count} messages + ${deletedDMs.count} DMs at ${now.toISOString()}`
        );

        return c.json({
            purgedAt: now.toISOString(),
            deletedMessages: deletedMessages.count,
            deletedDirectMessages: deletedDMs.count,
        });
    });

    // POST /api/admin/purge-expired
    // Hard-deletes ALL messages/DMs with a self-destruct TTL (expiresAt IS NOT NULL).
    app.post("/api/admin/purge-expired", async (c) => {
        const now = new Date();
        try {
            try {
                const [msgsToPurge, dmsToPurge] = await Promise.all([
                    prisma.message.findMany({
                        where: { expiresAt: { not: null }, fileUrl: { not: null } },
                        select: { fileUrl: true },
                    }),
                    prisma.directMessage.findMany({
                        where: { expiresAt: { not: null }, fileUrl: { not: null } },
                        select: { fileUrl: true },
                    }),
                ]);
                const fileUrls = [
                    ...msgsToPurge.map((m) => m.fileUrl),
                    ...dmsToPurge.map((d) => d.fileUrl),
                ];
                if (fileUrls.length > 0) {
                    await unpinMultipleFromPinata(fileUrls);
                }
            } catch (err) {
                console.error("[admin-purge] Failed to unpin files:", err);
            }

            const [deletedMessages, deletedDMs] = await Promise.all([
                prisma.message.deleteMany({
                    where: { expiresAt: { not: null } }, // all self-destruct messages
                }),
                prisma.directMessage.deleteMany({
                    where: { expiresAt: { not: null } }, // all self-destruct DMs
                }),
            ]);

            // Wipe the entire blockchain ledger — no messages left, audit log is reset
            let prunedBlocks = 0;
            let prunedTransactions = 0;
            try {
                const pruneResult = await blockchainLogger.purgeAllData();
                prunedBlocks = pruneResult.prunedBlocks;
                prunedTransactions = pruneResult.prunedTransactions;
            } catch (err) {
                console.error("[admin-purge] Blockchain full purge failed:", err);
            }

            console.log(
                `[admin-purge] Deleted ${deletedMessages.count} messages + ${deletedDMs.count} DMs, pruned ${prunedBlocks} blocks + ${prunedTransactions} TXs at ${now.toISOString()}`
            );

            return c.json({
                deletedMessages: deletedMessages.count,
                deletedDirectMessages: deletedDMs.count,
                prunedBlocks,
                prunedTransactions,
            });
        } catch (error) {
            console.error("[admin-purge] Error running purge:", error);
            return c.json({ error: "Failed to run message purge" }, 500);
        }
    });

    app.get("/api/users/:userId/status", async (c) => {
        return c.json({ isLive: isUserLive(c.req.param("userId")) });
    });

    app.get("/api/servers/:serverId/online", async (c) => {
        const serverId = c.req.param("serverId");
        const list = getOnlineUsersForServer(serverId);
        return c.json({ onlineUserIds: list });
    });

    // ── Steganography — MOVED TO CLIENT ─────────────────────────────────────
    // All steganographic operations now run in the browser via Web Workers.
    // These stubs return 410 Gone so old clients get a clear signal to upgrade.
    const STEG_GONE = { error: "Steganography has moved client-side. Update your Nexus client.", moved_to: "browser-web-worker" } as const;
    const stegRoutes = [
        "/api/steganography/encode",
        "/api/steganography/decode",
        "/api/steganography/encode-audio",
        "/api/steganography/decode-audio",
        "/api/steganography/encode-video",
        "/api/steganography/decode-video",
        "/api/steganography/encode-pdf",
        "/api/steganography/decode-pdf",
    ];
    for (const route of stegRoutes) {
        app.post(route, (c) => c.json(STEG_GONE, 410));
        app.get(route, (c) => c.json(STEG_GONE, 410));
    }




    // ── Admin: Platform Analytics ──────────────────────────────────────────────
    // GET /api/admin/platform-analytics
    // Returns platform-wide aggregate analytics: total profiles, servers, messages, etc.
    app.get("/api/admin/platform-analytics", async (c) => {
        try {
            const [
                totalProfiles,
                totalServers,
                totalChannels,
                totalMessages,
                totalDirectMessages,
                totalMembers,
                textChannels,
                audioChannels,
                videoChannels,
                expiringMessages,
                expiringDMs
            ] = await Promise.all([
                prisma.profile.count(),
                prisma.server.count(),
                prisma.channel.count(),
                prisma.message.count(),
                prisma.directMessage.count(),
                prisma.member.count(),
                prisma.channel.count({ where: { type: "TEXT" } }),
                prisma.channel.count({ where: { type: "AUDIO" } }),
                prisma.channel.count({ where: { type: "VIDEO" } }),
                prisma.message.count({ where: { expiresAt: { not: null } } }),
                prisma.directMessage.count({ where: { expiresAt: { not: null } } })
            ]);

            // Blockchain status — gracefully degrade when OrbitDB is offline
            let chainStatus = { connected: false, length: 0 } as { connected: boolean; length: number };
            let pendingCount = 0;
            try {
                chainStatus = await blockchainLogger.getChainStatus();
            } catch {
                // OrbitDB node not reachable — return safe defaults
            }
            try {
                const pending = await localBlockchain.getPending();
                pendingCount = pending.length;
            } catch {
                // OrbitDB node not reachable — return safe defaults
            }

            return c.json({
                totalProfiles,
                totalServers,
                totalChannels,
                totalMessages,
                totalDirectMessages,
                totalMembers,
                channelStats: {
                    text: textChannels,
                    audio: audioChannels,
                    video: videoChannels,
                },
                selfDestructStats: {
                    expiringMessages,
                    expiringDMs,
                },
                blockchain: {
                    connected: chainStatus.connected,
                    mode: "decentralized-orbitdb",
                    length: chainStatus.length,
                    note: chainStatus.connected
                        ? `OrbitDB Document Store (Chain Height: ${chainStatus.length} blocks)`
                        : "OrbitDB node offline — start with: yarn workspace @repo/orbitdb-node dev",
                    pendingTransactions: pendingCount,
                },
                system: {
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    platform: process.platform,
                    memory: process.memoryUsage(),
                }
            });
        } catch (error) {
            console.error("[platform-analytics] Error:", error);
            return c.json({ error: "Failed to fetch platform analytics" }, 500);
        }
    });

    // â”€â”€ Blockchain: Routes â€” MOVED TO CLIENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Blocks and verification are now stored in browser IndexedDB and synced via WebRTC.
    app.get("/api/blockchain/blocks", async (c) => {
        try {
            const blocks = await localBlockchain.getBlocks();
            return c.json(blocks);
        } catch (error) {
            return c.json({ error: "Failed to fetch blocks" }, 500);
        }
    });

    app.get("/api/blockchain/verify/:hash", async (c) => {
        const hash = c.req.param("hash");
        try {
            const result = await localBlockchain.verifyMessage(hash);
            if (result) {
                return c.json(result);
            }
            return c.json({ verified: false, message: "Hash not found in blockchain ledger" });
        } catch (error) {
            return c.json({ error: "Verification failed" }, 500);
        }
    });

    // â”€â”€ Server Invite via Email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // POST /api/servers/:serverId/invite/email
    app.post("/api/servers/:serverId/invite/email", requireAuth, async (c) => {
        const serverId = c.req.param("serverId");
        const body = await c.req.json<{ email?: string }>();
        const inviteEmail = body.email;
        if (!inviteEmail) {
            return c.json({ error: "Email is required" }, 400);
        }

        const server = await prisma.server.findUnique({
            where: { id: serverId },
        });

        if (!server) {
            return c.json({ error: "Server not found" }, 404);
        }

        const referer = c.req.header("referer");
        let origin = "http://localhost:3000";
        if (referer) {
            try {
                const url = new URL(referer);
                origin = url.origin;
            } catch (e) {
                // Ignore
            }
        }
        const inviteUrl = `${origin}/invite/${server.inviteCode}`;

        const html = getInviteEmailTemplate(server.name, inviteUrl);
        await sendMail({
            to: inviteEmail,
            subject: `Invitation to join ${server.name} on Nexus`,
            html,
        });

        return c.json({ success: true, message: "Invitation email dispatched successfully." });
    });

    // â”€â”€ Platform Database Integrity Audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // POST /api/blockchain/audit
    app.post("/api/blockchain/audit", requireAuth, async (c) => {
        try {
            const auditResult = await runAndEmailAudit();
            return c.json(auditResult);
        } catch (error) {
            console.error("[audit] Error running integrity audit:", error);
            return c.json({ error: "Integrity audit run failed" }, 500);
        }
    });

    return app;
}
