import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "@repo/db";
import { encryptMessage, decryptMessage } from "@repo/p2p";
import { requireAuth } from "./auth";
import { blockchainLogger } from "./lib/blockchain";
import { localBlockchain } from "./lib/local-blockchain";
import {
    decodeImage,
    decryptSecretText,
    downloadImage,
    encodeImage,
    isPasswordProtectedPayload,
    normalizeImageBase64,
    stegHttpStatus,
} from "./lib/steganography";
import { encodeAudio, decodeAndDecryptAudio, downloadAudio } from "./lib/audio-steg";
import { encodeVideo, decodeAndDecryptVideo, downloadVideo } from "./lib/video-steg";
import { encodePdf, decodeAndDecryptPdf, downloadPdf } from "./lib/pdf-steg";
import { broadcastMessage, broadcastMessageUpdate, isUserLive, getOnlineUsersForServer } from "./socket";
import { deleteUploadThingFileForMessage } from "./lib/uploadthing-cleanup";

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
            origin: "*",
            allowHeaders: ["Authorization", "Content-Type", "X-User-Id", "Cookie"],
            allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            credentials: true,
        }),
    );

    app.get("/health", async (c) => {
        const bcStatus = await blockchainLogger.getChainStatus();
        return c.json({
            status: "ok",
            blockchain: bcStatus,
            connected_users: 0,
        });
    });

    // ── Messages ──────────────────────────────────────────────
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

        for (const item of page) {
            if (item.content) {
                item.content = await decryptMessage(item.content, channelId);
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

        const encryptedContent = await encryptMessage(content, channelId);
        const bcHash = await blockchainLogger.logMessageBackground(
            profile.name,
            `channel:${channelId}`,
            content,
            channelId,
        );

        const message = await prisma.message.create({
            data: {
                content: encryptedContent,
                memberId: member.id,
                channelId,
                fileUrl: fileUrl ?? null,
            },
            include: { member: memberInclude },
        });

        message.content = await decryptMessage(message.content, channelId);
        broadcastMessage(io, channelId, message);

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

        await deleteUploadThingFileForMessage(existing.fileUrl, {
            messageId,
        });

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

    // ── Direct messages ─────────────────────────────────────
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

        for (const item of page) {
            if (item.content) {
                item.content = await decryptMessage(item.content, conversationId);
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

        const encryptedContent = await encryptMessage(content, conversationId);
        const bcHash = await blockchainLogger.logMessageBackground(
            profile.name,
            `dm:${conversationId}`,
            content,
            conversationId,
        );

        const message = await prisma.directMessage.create({
            data: {
                content: encryptedContent,
                memberId,
                conversationId,
                fileUrl: fileUrl ?? null,
            },
            include: { member: memberInclude },
        });

        message.content = await decryptMessage(message.content, conversationId);
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

        await deleteUploadThingFileForMessage(existing.fileUrl, {
            directMessageId: messageId,
        });

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

    // ── Servers ─────────────────────────────────────────────
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

    // ── Channels ────────────────────────────────────────────
    app.post("/api/channels", requireAuth, async (c) => {
        const userId = c.get("userId") as string;
        const body = await c.req.json<{
            name?: string;
            type?: "TEXT" | "AUDIO" | "VIDEO";
            serverId?: string;
        }>();

        // serverId is sent as a query param by the frontend (?serverId=...)
        // but may also arrive in the body — support both
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

        await prisma.channel.delete({ where: { id: channelId } });
        return c.json({ success: true });
    });

    // ── Members ─────────────────────────────────────────────
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

    // ── Profile ─────────────────────────────────────────────
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

    // ── Blockchain & users ──────────────────────────────────
    app.get("/api/blockchain/status", async (c) => {
        return c.json(await blockchainLogger.getChainStatus());
    });

    app.post("/api/blockchain/mine", async (c) => {
        const result = await blockchainLogger.minePending();
        return c.json(
            result ?? {
                message: "No pending transactions or node unreachable",
            },
        );
    });

    app.get("/api/users/:userId/status", async (c) => {
        return c.json({ isLive: isUserLive(c.req.param("userId")) });
    });

    app.get("/api/servers/:serverId/online", async (c) => {
        const serverId = c.req.param("serverId");
        const list = getOnlineUsersForServer(serverId);
        return c.json({ onlineUserIds: list });
    });

    // ── Steganography ───────────────────────────────────────
    app.post("/api/steganography/encode", async (c) => {
        try {
            const body = await c.req.json<{
                image_url?: string;
                secret_text?: string;
                password?: string;
            }>();
            const imageUrl = body.image_url?.trim();
            const secretText = body.secret_text?.trim();
            const password = body.password?.trim() || undefined;

            if (!imageUrl) {
                return c.json({ error: "image_url is required" }, 400);
            }
            if (!secretText) {
                return c.json({ error: "secret_text is required" }, 400);
            }

            const imageBytes = await downloadImage(imageUrl);
            const encodedBytes = await encodeImage(imageBytes, secretText, password);

            return c.json({
                encoded_image: encodedBytes.toString("base64"),
                filename: "hidden_message.png",
                format: "image/png",
                password_protected: Boolean(password),
                message: `Hidden '${secretText.length}' characters in image using LSB steganography`,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Encoding failed";
            return c.json({ error: message }, stegHttpStatus(message));
        }
    });

    app.post("/api/steganography/decode", async (c) => {
        try {
            const body = await c.req.json<{ image_url?: string; password?: string }>();
            const imageUrl = body.image_url?.trim();
            const password = body.password?.trim() || undefined;
            if (!imageUrl) {
                return c.json({ error: "image_url is required" }, 400);
            }

            const imageBytes = await downloadImage(imageUrl);
            const embeddedPayload = await decodeImage(imageBytes);

            if (!embeddedPayload?.trim()) {
                return c.json({ secret_text: null, found: false, password_required: false });
            }

            if (isPasswordProtectedPayload(embeddedPayload)) {
                const { text, passwordRequired } = decryptSecretText(embeddedPayload, password);
                if (passwordRequired) {
                    return c.json({
                        secret_text: null,
                        found: true,
                        password_required: true,
                    });
                }
                if (!text?.trim()) {
                    return c.json({ secret_text: null, found: false, password_required: false });
                }
                return c.json({
                    secret_text: text,
                    found: true,
                    password_required: false,
                    length: text.length,
                });
            }

            const printableRatio =
                [...embeddedPayload].filter((ch) => ch >= " " && ch <= "~").length /
                Math.max(embeddedPayload.length, 1);
            if (printableRatio < 0.7) {
                return c.json({ secret_text: null, found: false, password_required: false });
            }

            return c.json({
                secret_text: embeddedPayload,
                found: true,
                password_required: false,
                length: embeddedPayload.length,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Decoding failed";
            const status = message === "Incorrect password" ? 401 : 400;
            return c.json({ error: message, found: false }, status);
        }
    });

    app.post("/api/steganography/encode-base64", async (c) => {
        try {
            const body = await c.req.json<{
                image_b64?: string;
                secret_text?: string;
                password?: string;
            }>();
            if (!body.image_b64 || !body.secret_text?.trim()) {
                return c.json(
                    { error: "image_b64 and secret_text are required" },
                    400,
                );
            }

            const password = body.password?.trim() || undefined;
            const imageB64 = normalizeImageBase64(body.image_b64);
            if (!imageB64) {
                return c.json({ error: "image_b64 is invalid or empty" }, 400);
            }

            const imageBytes = Buffer.from(imageB64, "base64");
            if (!imageBytes.length) {
                return c.json({ error: "image_b64 is invalid or empty" }, 400);
            }

            const encodedBytes = await encodeImage(
                imageBytes,
                body.secret_text.trim(),
                password,
            );

            return c.json({
                encoded_image: encodedBytes.toString("base64"),
                encoded_b64: encodedBytes.toString("base64"),
                filename: "hidden_message.png",
                format: "image/png",
                password_protected: Boolean(password),
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Encoding failed";
            return c.json({ error: message }, stegHttpStatus(message));
        }
    });

    // ── Audio Steganography ──────────────────────────────────
    app.post("/api/steganography/encode-audio", async (c) => {
        try {
            const body = await c.req.json<{
                audio_url?: string;
                audio_b64?: string;
                secret_text?: string;
                password?: string;
            }>();
            const secretText = body.secret_text?.trim();
            const password = body.password?.trim() || undefined;

            if (!secretText) {
                return c.json({ error: "secret_text is required" }, 400);
            }

            let audioBuffer: Buffer;
            if (body.audio_b64) {
                const raw = normalizeImageBase64(body.audio_b64);
                audioBuffer = Buffer.from(raw, "base64");
            } else if (body.audio_url) {
                audioBuffer = await downloadAudio(body.audio_url);
            } else {
                return c.json({ error: "audio_url or audio_b64 is required" }, 400);
            }

            const encoded = encodeAudio(audioBuffer, secretText, password);

            return c.json({
                encoded_b64: encoded.toString("base64"),
                password_protected: Boolean(password),
                message: `Hidden '${secretText.length}' characters in audio using append steganography`,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Encoding failed";
            return c.json({ error: message }, 500);
        }
    });

    app.post("/api/steganography/decode-audio", async (c) => {
        try {
            const body = await c.req.json<{ audio_url?: string; password?: string }>();
            const audioUrl = body.audio_url?.trim();
            const password = body.password?.trim() || undefined;

            if (!audioUrl) {
                return c.json({ error: "audio_url is required" }, 400);
            }

            const audioBuffer = await downloadAudio(audioUrl);
            const result = decodeAndDecryptAudio(audioBuffer, password);

            if (!result.found) {
                return c.json({ secret_text: null, found: false, password_required: false });
            }

            if (result.passwordRequired) {
                return c.json({ secret_text: null, found: true, password_required: true });
            }

            return c.json({
                secret_text: result.secretText,
                found: true,
                password_required: false,
                length: result.secretText?.length ?? 0,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Decoding failed";
            const status = message === "Incorrect password" ? 401 : 400;
            return c.json({ error: message, found: false }, status);
        }
    });

    // ── Video Steganography ──────────────────────────────────
    app.post("/api/steganography/encode-video", async (c) => {
        try {
            const body = await c.req.json<{
                video_url?: string;
                video_b64?: string;
                secret_text?: string;
                password?: string;
            }>();
            const secretText = body.secret_text?.trim();
            const password = body.password?.trim() || undefined;

            if (!secretText) {
                return c.json({ error: "secret_text is required" }, 400);
            }

            let videoBuffer: Buffer;
            if (body.video_b64) {
                const raw = normalizeImageBase64(body.video_b64);
                videoBuffer = Buffer.from(raw, "base64");
            } else if (body.video_url) {
                videoBuffer = await downloadVideo(body.video_url);
            } else {
                return c.json({ error: "video_url or video_b64 is required" }, 400);
            }

            const encoded = encodeVideo(videoBuffer, secretText, password);

            return c.json({
                encoded_b64: encoded.toString("base64"),
                password_protected: Boolean(password),
                message: `Hidden '${secretText.length}' characters in video using append steganography`,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Encoding failed";
            return c.json({ error: message }, 500);
        }
    });

    app.post("/api/steganography/decode-video", async (c) => {
        try {
            const body = await c.req.json<{ video_url?: string; password?: string }>();
            const videoUrl = body.video_url?.trim();
            const password = body.password?.trim() || undefined;

            if (!videoUrl) {
                return c.json({ error: "video_url is required" }, 400);
            }

            const videoBuffer = await downloadVideo(videoUrl);
            const result = decodeAndDecryptVideo(videoBuffer, password);

            if (!result.found) {
                return c.json({ secret_text: null, found: false, password_required: false });
            }

            if (result.passwordRequired) {
                return c.json({ secret_text: null, found: true, password_required: true });
            }

            return c.json({
                secret_text: result.secretText,
                found: true,
                password_required: false,
                length: result.secretText?.length ?? 0,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Decoding failed";
            const status = message === "Incorrect password" ? 401 : 400;
            return c.json({ error: message, found: false }, status);
        }
    });

    // ── PDF Steganography ────────────────────────────────────
    app.post("/api/steganography/encode-pdf", async (c) => {
        try {
            const body = await c.req.json<{
                pdf_url?: string;
                pdf_b64?: string;
                secret_text?: string;
                password?: string;
            }>();
            const secretText = body.secret_text?.trim();
            const password = body.password?.trim() || undefined;

            if (!secretText) {
                return c.json({ error: "secret_text is required" }, 400);
            }

            let pdfBuffer: Buffer;
            if (body.pdf_b64) {
                const raw = normalizeImageBase64(body.pdf_b64);
                pdfBuffer = Buffer.from(raw, "base64");
            } else if (body.pdf_url) {
                pdfBuffer = await downloadPdf(body.pdf_url);
            } else {
                return c.json({ error: "pdf_url or pdf_b64 is required" }, 400);
            }

            const encoded = encodePdf(pdfBuffer, secretText, password);

            return c.json({
                encoded_b64: encoded.toString("base64"),
                password_protected: Boolean(password),
                message: `Hidden '${secretText.length}' characters in PDF using post-EOF steganography`,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Encoding failed";
            return c.json({ error: message }, 500);
        }
    });

    app.post("/api/steganography/decode-pdf", async (c) => {
        try {
            const body = await c.req.json<{ pdf_url?: string; password?: string }>();
            const pdfUrl = body.pdf_url?.trim();
            const password = body.password?.trim() || undefined;

            if (!pdfUrl) {
                return c.json({ error: "pdf_url is required" }, 400);
            }

            const pdfBuffer = await downloadPdf(pdfUrl);
            const result = decodeAndDecryptPdf(pdfBuffer, password);

            if (!result.found) {
                return c.json({ secret_text: null, found: false, password_required: false });
            }

            if (result.passwordRequired) {
                return c.json({ secret_text: null, found: true, password_required: true });
            }

            return c.json({
                secret_text: result.secretText,
                found: true,
                password_required: false,
                length: result.secretText?.length ?? 0,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Decoding failed";
            const status = message === "Incorrect password" ? 401 : 400;
            return c.json({ error: message, found: false }, status);
        }
    });

    // ── Internal: purge expired messages ─────────────────────────────────
    // Call this endpoint to hard-delete messages whose 24-hour TTL has passed.
    app.get("/api/internal/purge-expired", async (c) => {
        const secret = c.req.header("X-Internal-Secret");
        const expectedSecret = process.env.INTERNAL_SECRET ?? "nexus-internal";
        if (secret !== expectedSecret) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        const now = new Date();

        const [deletedMessages, deletedDMs] = await Promise.all([
            prisma.message.deleteMany({
                where: { expiresAt: { lte: now } },
            }),
            prisma.directMessage.deleteMany({
                where: { expiresAt: { lte: now } },
            }),
        ]);
        console.log(
            `[purge-expired] Deleted ${deletedMessages.count} messages + ${deletedDMs.count} DMs at ${now.toISOString()}`
        );

        return c.json({
            purgedAt: now.toISOString(),
            deletedMessages: deletedMessages.count,
            deletedDirectMessages: deletedDMs.count,
        });
    });

    // ── Admin: Platform Analytics ─────────────────────────────────────────
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

            const status = await blockchainLogger.getChainStatus();
            const pending = localBlockchain.getPending();

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
                    connected: status.connected,
                    length: status.length,
                    localLength: status.local_length,
                    nodeId: status.node_id,
                    pendingTransactions: pending.length,
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

    // ── Blockchain: Blocks ─────────────────────────────────────────────────
    // GET /api/blockchain/blocks
    // Returns list of blocks in direct or paginated structure.
    app.get("/api/blockchain/blocks", async (c) => {
        const allBlocks = localBlockchain.getBlocks();
        const pageStr = c.req.query("page");
        if (!pageStr) {
            // Return flat array for /servers/[serverId]/analytics compatibility
            return c.json(allBlocks);
        }

        const page = Math.max(1, parseInt(pageStr, 10));
        const perPage = Math.min(50, Math.max(1, parseInt(c.req.query("perPage") ?? "10", 10)));
        const total = allBlocks.length;
        const reversed = [...allBlocks].reverse();
        const start = (page - 1) * perPage;
        const blocks = reversed.slice(start, start + perPage).map((block) => ({
            index: block.index,
            timestamp: block.timestamp,
            hash: block.hash,
            previousHash: block.previousHash,
            proof: block.proof,
            transactionCount: block.transactions.length,
            transactions: block.transactions.map((tx) => ({
                type: tx.type,
                sender: tx.sender,
                recipient: tx.recipient,
                hash: tx.hash,
            })),
        }));

        return c.json({
            blocks,
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage),
        });
    });

    // ── Blockchain: Verify Hash ───────────────────────────────────────────
    // GET /api/blockchain/verify/:hash
    // Audits a transaction payload hash against the ledger.
    app.get("/api/blockchain/verify/:hash", async (c) => {
        const hash = c.req.param("hash");
        const result = await localBlockchain.verifyMessage(hash);
        if (!result) {
            return c.json({ verified: false, message: "Hash not found in ledger" }, 404);
        }
        return c.json(result);
    });

    return app;
}
