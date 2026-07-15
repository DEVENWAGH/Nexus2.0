"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import { useParams } from "next/navigation";

type SocketContentType = {
    socket: Socket | null;
    isConnected: boolean;
};

const socketContext = createContext<SocketContentType>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => {
    return useContext(socketContext);
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const { userId } = useAuth();
    const params = useParams();

    const serverId = params?.serverId as string | undefined;

    useEffect(() => {
        const socketUrl =
            process.env.NEXT_PUBLIC_SOCKET_URL ||
            process.env.NEXT_PUBLIC_API_URL;
        if (!socketUrl) {
            console.warn(
                "[Socket] NEXT_PUBLIC_SOCKET_URL is not set; real-time chat disabled.",
            );
            return;
        }

        const socketInstance = io(socketUrl, {
            path: "/api/socket/io",
            addTrailingSlash: false,
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            withCredentials: true,
        });

        setSocket(socketInstance);

        const onConnect = () => {
            setIsConnected(true);
            if (userId) {
                socketInstance.emit("identify", { userId, serverId });
            }
        };

        socketInstance.on("connect", onConnect);

        socketInstance.on("disconnect", () => {
            setIsConnected(false);
        });

        socketInstance.on("connect_error", () => {
            setIsConnected(false);
        });

        return () => {
            socketInstance.off("connect", onConnect);
            socketInstance.disconnect();
            setSocket(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (socket && userId) {
            const identify = () => {
                socket.emit("identify", { userId, serverId });
            };
            identify();
            socket.on("connect", identify);
            return () => {
                socket.off("connect", identify);
            };
        }
    }, [socket, userId, serverId]);

    return (
        <socketContext.Provider value={{ socket, isConnected }}>
            {children}
        </socketContext.Provider>
    );
};
