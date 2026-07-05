import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";

export type SocketIO = SocketIOServer;

const userSessions = new Map<
    string,
    { socketId: string; serverId?: string; connectedAt: number }
>();
const sidToUser = new Map<string, string>();

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
    const io = new SocketIOServer(httpServer, {
        path: "/api/socket/io",
        cors: { origin: "*", credentials: true },
        addTrailingSlash: false,
    });

    io.on("connection", (socket) => {
        console.log(`[Socket.IO] Connected: ${socket.id}`);

        socket.on("identify", (data: { userId?: string; serverId?: string }) => {
            const userId = data?.userId;
            if (!userId) return;

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

        socket.on("disconnect", () => {
            const userId = sidToUser.get(socket.id);
            if (userId) {
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
