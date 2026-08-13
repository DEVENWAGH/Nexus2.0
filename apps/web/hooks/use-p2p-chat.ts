"use client";

import { useEffect, useRef, useState } from "react";
import { P2PMesh, type P2PChatMessage } from "@repo/p2p";
import { useAuth } from "@/hooks/use-auth";

const SIGNALING_URL =
    process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:3001";

/**
 * Hook for P2P real-time chat in a room (channel or DM conversation).
 * Use alongside OrbitDB-backed history; new messages flow peer-to-peer.
 */
export function useP2PChat({
    roomId,
    enabled = true,
    onMessage,
}: {
    roomId: string;
    enabled?: boolean;
    onMessage?: (message: P2PChatMessage) => void;
}) {
    const { userId } = useAuth();
    const meshRef = useRef<P2PMesh | null>(null);
    const [connectedPeers, setConnectedPeers] = useState(0);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!enabled || !roomId || !userId) return;

        const mesh = new P2PMesh({
            signalingUrl: SIGNALING_URL,
            roomId,
            peerId: crypto.randomUUID(),
            userId,
            encrypt: true,
        });

        mesh.on("peer-connected", () => {
            setConnectedPeers(mesh.connectedPeerCount);
            setIsReady(true);
        });

        mesh.on("peer-disconnected", () => {
            setConnectedPeers(mesh.connectedPeerCount);
        });

        mesh.on("message", (message) => {
            onMessage?.(message);
        });

        const unsubscribeError = mesh.on("error", (error) => {
            console.warn("[useP2PChat] P2P Mesh error:", error);
            setIsReady(false);
        });

        meshRef.current = mesh;
        void mesh.join()
            .then(() => {
                setIsReady(true);
            })
            .catch((err) => {
                console.warn(
                    "[useP2PChat] Failed to join signaling mesh (chat will work over backup REST/Socket.IO channel):",
                    err instanceof Error ? err.message : err,
                );
                setIsReady(false);
            });

        return () => {
            unsubscribeError();
            mesh.leave();
            meshRef.current = null;
        };
    }, [roomId, userId, enabled, onMessage]);

    const sendP2P = async (content: string, id?: string) => {
        await meshRef.current?.send(content, id);
    };

    return { sendP2P, connectedPeers, isReady, mesh: meshRef.current };
}
