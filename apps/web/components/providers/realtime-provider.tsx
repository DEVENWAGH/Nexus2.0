"use client";

import React, { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSocket } from "./socket-provider";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type ServerUpdatePayload = {
    serverId: string;
    type: "channel" | "member" | "server";
    action?: "create" | "update" | "delete" | "join" | "leave";
    data?: any;
    notification?: {
        title: string;
        message: string;
    };
};

const playChime = () => {
    try {
        const AudioContextClass =
            window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();

        const playTone = (freq: number, start: number, duration: number) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);

            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.06, start + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

            osc.start(start);
            osc.stop(start + duration);
        };

        const now = audioCtx.currentTime;
        playTone(587.33, now, 0.2); // D5
        playTone(880.0, now + 0.08, 0.35); // A5
    } catch {
        // audio context failed or blocked by autoplay policy
    }
};

export const RealtimeProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const { socket } = useSocket();
    const router = useRouter();
    const params = useParams();
    const queryClient = useQueryClient();

    const activeServerId = params?.serverId as string | undefined;
    const activeChannelId = params?.channelId as string | undefined;

    const paramsRef = useRef({ activeServerId, activeChannelId });
    useEffect(() => {
        paramsRef.current = { activeServerId, activeChannelId };
    }, [activeServerId, activeChannelId]);

    // Keep active server room joined
    useEffect(() => {
        if (!socket || !activeServerId) return;

        const join = () => {
            socket.emit("join-server", activeServerId);
        };

        join();
        socket.on("connect", join);

        return () => {
            socket.off("connect", join);
            socket.emit("leave-server", activeServerId);
        };
    }, [socket, activeServerId]);

    // Listen to real-time server updates
    useEffect(() => {
        if (!socket) return;

        const handleServerUpdate = (payload: ServerUpdatePayload) => {
            console.log("[Realtime] Received server:update:", payload);

            // 1. Silently revalidate Next.js Server Components (NavigationSidebar, ServerSidebar, members, channels)
            router.refresh();

            // 2. Invalidate TanStack query cache if necessary
            queryClient.invalidateQueries();

            // 3. Show notification toast and sound if provided
            if (payload.notification) {
                playChime();
                toast.info(payload.notification.title, {
                    description: payload.notification.message,
                });
            }

            const current = paramsRef.current;

            // 4. Handle server deletion: if user is currently in that server, redirect gracefully
            if (
                payload.type === "server" &&
                payload.action === "delete" &&
                current.activeServerId === payload.serverId
            ) {
                toast.error("This server has been deleted.");
                router.push("/setup");
                return;
            }

            // 5. Handle being kicked from the server
            if (
                payload.type === "member" &&
                payload.action === "leave" &&
                payload.data?.kicked &&
                current.activeServerId === payload.serverId
            ) {
                toast.error("You were removed from this server.");
                router.push("/setup");
                return;
            }

            // 6. Handle channel deletion: if user is currently viewing the deleted channel
            if (
                payload.type === "channel" &&
                payload.action === "delete" &&
                current.activeChannelId &&
                payload.data?.channelId === current.activeChannelId
            ) {
                toast.info(
                    `Channel #${payload.data?.channelName || ""} was deleted.`,
                );
                router.push(`/servers/${payload.serverId}`);
                return;
            }
        };

        socket.on("server:update", handleServerUpdate);

        return () => {
            socket.off("server:update", handleServerUpdate);
        };
    }, [socket, router, queryClient]);

    return <>{children}</>;
};
