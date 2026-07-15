import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifySessionToken } from "@repo/auth";

export type SocketIO = SocketIOServer;

const userSessions = new Map<
    string,
    { socketId: string; serverId?: string; connectedAt: number }
>();
const sidToUser = new Map<string, string>();
const activeCalls = new Map<
    string,
    {
        callId: string;
        callerId: string;
        callerMemberId: string;
        recipientId: string;
        recipientMemberId: string;
        conversationId: string;
        serverId?: string;
        callType: "video" | "audio";
    }
>();


const p2pRooms = new Map<
    string,
    Map<string, { peerId: string; userId?: string; socketId: string }>
>();

export function getActiveRoomPeers(roomId: string) {
    const room = p2pRooms.get(roomId);
    if (!room) return [];
    return Array.from(room.values()).map(p => ({
        peerId: p.peerId,
        userId: p.userId,
    }));
}

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
    const io = new SocketIOServer(httpServer, {
        path: "/api/socket/io",
        cors: { origin: "*", credentials: true },
        addTrailingSlash: false,
    });

    io.use(async (socket, next) => {
        try {
            const cookieHeader = socket.handshake.headers.cookie ?? "";
            const match = cookieHeader.match(/__session=([^;]+)/);
            if (!match) {
                return next(new Error("Unauthorized"));
            }
            const claims = await verifySessionToken(match[1]);
            if (!claims?.sub) {
                return next(new Error("Unauthorized"));
            }
            socket.data.userId = claims.sub;
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`[Socket.IO] Connected: ${socket.id}`);

        socket.on("identify", (data: { userId?: string; serverId?: string }) => {
            const sessionUserId = socket.data.userId as string | undefined;
            const userId = data?.userId;
            if (!sessionUserId || !userId || userId !== sessionUserId) return;

            userSessions.set(userId, {
                socketId: socket.id,
                serverId: data.serverId,
                connectedAt: Date.now(),
            });
            sidToUser.set(socket.id, userId);
            void socket.join(`user:${userId}`);
            console.log(`[Socket.IO] Identified: ${userId} -> ${socket.id}`);
        });

        socket.on("join-channel", (channelId: string) => {
            const room = `chat:${channelId}:messages`;
            void socket.join(room);
            console.log(`[Socket.IO] ${socket.id} joined channel room: ${room}`);
        });

        socket.on("join-conversation", (conversationId: string) => {
            const room = `chat:${conversationId}:messages`;
            void socket.join(room);
            console.log(`[Socket.IO] ${socket.id} joined conversation room: ${room}`);
        });

        socket.on("leave-channel", (channelId: string) => {
            const room = `chat:${channelId}:messages`;
            void socket.leave(room);
        });

        socket.on("leave-conversation", (conversationId: string) => {
            const room = `chat:${conversationId}:messages`;
            void socket.leave(room);
        });

        socket.on("call:initiate", (data: {
            callerId: string;
            callerMemberId: string;
            callerName: string;
            callerImage: string;
            recipientId: string;
            recipientMemberId: string;
            recipientName?: string;
            recipientImage?: string;
            conversationId: string;
            serverId?: string;
            callType?: "video" | "audio";
        }) => {
            const sessionUserId = socket.data.userId as string | undefined;
            if (!sessionUserId || data.callerId !== sessionUserId) return;
            const callId = crypto.randomUUID();
            const callType = data.callType || "audio";

            activeCalls.set(callId, {
                callId,
                callerId: data.callerId,
                callerMemberId: data.callerMemberId,
                recipientId: data.recipientId,
                recipientMemberId: data.recipientMemberId,
                conversationId: data.conversationId,
                serverId: data.serverId,
                callType,
            });

            console.log(`[Socket.IO] Call initiated: ${callId} (${data.callerName} -> ${data.recipientId})`);

            const recipientSession = userSessions.get(data.recipientId);
            if (!recipientSession) {
                socket.emit("call:user-offline");
                activeCalls.delete(callId);
                return;
            }

            // Emit incoming call event to recipient
            io.to(recipientSession.socketId).emit("call:incoming", {
                callId,
                callerId: data.callerId,
                callerMemberId: data.callerMemberId,
                callerName: data.callerName,
                callerImage: data.callerImage,
                conversationId: data.conversationId,
                callType,
                initiatedAt: Date.now(),
            });

            // Emit ringing status back to caller
            socket.emit("call:ringing", {
                callId,
                recipientId: data.recipientId,
                recipientMemberId: data.recipientMemberId,
                recipientName: data.recipientName || "User",
                initiatedAt: Date.now(),
            });
        });

        socket.on("call:accept", (data: { callId: string }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            console.log(`[Socket.IO] Call accepted: ${data.callId}`);

            const callerSession = userSessions.get(call.callerId);
            const recipientSession = userSessions.get(call.recipientId);

            const acceptPayload = {
                callId: call.callId,
                roomName: `call_${call.callId}`,
                conversationId: call.conversationId,
                serverId: call.serverId,
                callerId: call.callerId,
                callerMemberId: call.callerMemberId,
                recipientId: call.recipientId,
                recipientMemberId: call.recipientMemberId,
            };

            if (callerSession) {
                io.to(callerSession.socketId).emit("call:accepted", acceptPayload);
            }
            if (recipientSession) {
                io.to(recipientSession.socketId).emit("call:accepted", acceptPayload);
            }
        });

        socket.on("call:reject", (data: { callId: string }) => {
            const call = activeCalls.get(data.callId);
            if (!call) return;

            console.log(`[Socket.IO] Call rejected: ${data.callId}`);
            const callerSession = userSessions.get(call.callerId);
            if (callerSession) {
                io.to(callerSession.socketId).emit("call:rejected", {
                    callId: call.callId,
                    recipientName: "User",
                });
            }
            activeCalls.delete(data.callId);
        });

        socket.on("call:cancel", (data: { callId?: string }) => {
            let foundCallId = data?.callId;
            if (!foundCallId) {
                const userId = sidToUser.get(socket.id);
                if (userId) {
                    for (const [id, c] of activeCalls.entries()) {
                        if (c.callerId === userId) {
                            foundCallId = id;
                            break;
                        }
                    }
                }
            }
            if (!foundCallId) return;

            const call = activeCalls.get(foundCallId);
            if (!call) return;

            console.log(`[Socket.IO] Call cancelled: ${foundCallId}`);
            const recipientSession = userSessions.get(call.recipientId);
            if (recipientSession) {
                io.to(recipientSession.socketId).emit("call:cancelled");
            }
            activeCalls.delete(foundCallId);
        });

        socket.on("call:end", (data: { callId?: string }) => {
            let foundCallId = data?.callId;

            // If callId not provided, search by user
            if (!foundCallId) {
                const userId = sidToUser.get(socket.id);
                if (userId) {
                    for (const [id, c] of activeCalls.entries()) {
                        if (c.callerId === userId || c.recipientId === userId) {
                            foundCallId = id;
                            break;
                        }
                    }
                }
            }

            if (!foundCallId) return;
            const call = activeCalls.get(foundCallId);
            if (!call) return;

            console.log(`[Socket.IO] Call ended: ${foundCallId}`);
            const callerSession = userSessions.get(call.callerId);
            const recipientSession = userSessions.get(call.recipientId);

            if (callerSession) {
                io.to(callerSession.socketId).emit("call:ended");
            }
            if (recipientSession) {
                io.to(recipientSession.socketId).emit("call:ended");
            }

            activeCalls.delete(foundCallId);
        });

        // ── P2P WebRTC Signaling events ──────────────────────────────────────
        socket.on("p2p:join", (data: { roomId: string; peerId: string; userId?: string }) => {
            const sessionUserId = socket.data.userId as string | undefined;
            const { roomId, peerId } = data;
            const userId = sessionUserId;
            if (!sessionUserId) return;
            let room = p2pRooms.get(roomId);
            if (!room) {
                room = new Map();
                p2pRooms.set(roomId, room);
            }
            room.set(peerId, { peerId, userId, socketId: socket.id });

            // Get existing peers in the room
            const existingPeers = Array.from(room.values())
                .filter(p => p.peerId !== peerId)
                .map(p => ({ peerId: p.peerId, userId: p.userId }));

            socket.emit("p2p:joined", { roomId, peerId, peers: existingPeers });

            // Notify others
            for (const peer of room.values()) {
                if (peer.peerId !== peerId) {
                    io.to(peer.socketId).emit("p2p:peer-joined", { peerId, userId });
                }
            }
            console.log(`[Socket.IO P2P] Peer ${peerId} joined room ${roomId}`);
        });

        socket.on("p2p:leave", (data: { roomId: string; peerId: string }) => {
            const { roomId, peerId } = data;
            const room = p2pRooms.get(roomId);
            if (room) {
                room.delete(peerId);
                if (room.size === 0) {
                    p2pRooms.delete(roomId);
                } else {
                    for (const peer of room.values()) {
                        io.to(peer.socketId).emit("p2p:peer-left", { peerId });
                    }
                }
            }
            console.log(`[Socket.IO P2P] Peer ${peerId} left room ${roomId}`);
        });

        socket.on("p2p:signal", (data: { roomId: string; toPeerId: string; payload: any; fromPeerId: string }) => {
            const room = p2pRooms.get(data.roomId);
            const target = room?.get(data.toPeerId);
            if (target) {
                io.to(target.socketId).emit("p2p:signal", {
                    fromPeerId: data.fromPeerId,
                    payload: data.payload,
                });
            }
        });

        socket.on("disconnect", () => {
            const userId = sidToUser.get(socket.id);
            if (userId) {
                // Find and clean up any calls involving this user
                for (const [id, c] of activeCalls.entries()) {
                    if (c.callerId === userId || c.recipientId === userId) {
                        console.log(`[Socket.IO] User ${userId} disconnected during call. Ending call ${id}`);
                        const otherUserId = c.callerId === userId ? c.recipientId : c.callerId;
                        const otherSession = userSessions.get(otherUserId);
                        if (otherSession) {
                            io.to(otherSession.socketId).emit("call:ended");
                        }
                        activeCalls.delete(id);
                    }
                }

                // P2P rooms cleanup on disconnect
                for (const [roomId, room] of p2pRooms.entries()) {
                    for (const [peerId, peer] of room.entries()) {
                        if (peer.socketId === socket.id) {
                            room.delete(peerId);
                            console.log(`[Socket.IO P2P] Cleaned up peer ${peerId} from room ${roomId} on disconnect`);
                            if (room.size === 0) {
                                p2pRooms.delete(roomId);
                            } else {
                                for (const otherPeer of room.values()) {
                                    io.to(otherPeer.socketId).emit("p2p:peer-left", { peerId });
                                }
                            }
                        }
                    }
                }

                userSessions.delete(userId);
                sidToUser.delete(socket.id);
            }
            console.log(`[Socket.IO] Disconnected: ${socket.id} (user=${userId})`);
        });
    });


    return io;
}

export function broadcastMessage(
    io: SocketIOServer,
    chatId: string,
    message: unknown,
) {
    const roomKey = `chat:${chatId}:messages`;
    io.to(roomKey).emit(roomKey, message);
    console.log(`[Socket.IO] Broadcast new message to ${roomKey}`);
}

export function broadcastMessageUpdate(
    io: SocketIOServer,
    chatId: string,
    message: unknown,
) {
    const roomKey = `chat:${chatId}:messages`;
    const updateKey = `chat:${chatId}:messages:update`;
    io.to(roomKey).emit(updateKey, message);
    console.log(`[Socket.IO] Broadcast message update to ${roomKey}`);
}

export function getConnectedUserCount(): number {
    return userSessions.size;
}

export function isUserLive(userId: string): boolean {
    return userSessions.has(userId);
}

export function getOnlineUsersForServer(serverId: string): string[] {
    const list: string[] = [];
    for (const [userId, session] of userSessions.entries()) {
        if (session.serverId === serverId) {
            list.push(userId);
        }
    }
    return list;
}
