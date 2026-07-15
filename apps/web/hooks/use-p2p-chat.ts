"use client";

import { useEffect, useRef, useState } from "react";
import { P2PMesh, type P2PChatMessage } from "@repo/p2p";
import { useAuth } from "@/hooks/use-auth";
import { fetchSignalingTicket } from "@/lib/fetch-signaling-ticket";
import { getOrCreateIdentity } from "@/hooks/use-identity";
import { verifyPayload, signPayload } from "@repo/p2p";

const SIGNALING_URL =
    process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:3001";

export function useP2PChat({
    roomId,
    enabled = true,
    onMessage,
    onGossipStats,
}: {
    roomId: string;
    enabled?: boolean;
    onMessage?: (message: P2PChatMessage) => void;
    onGossipStats?: (stats: ReturnType<P2PMesh["getGossipStats"]>) => void;
}) {
    const { userId } = useAuth();
    const meshRef = useRef<P2PMesh | null>(null);
    const peerIdRef = useRef(crypto.randomUUID());
    const [connectedPeers, setConnectedPeers] = useState(0);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!enabled || !roomId || !userId) return;

        const peerId = peerIdRef.current;
        const mesh = new P2PMesh({
            signalingUrl: SIGNALING_URL,
            roomId,
            peerId,
            userId,
            encrypt: true,
            enableGossip: true,
            maxTtl: 3,
            getSignalingTicket: () => fetchSignalingTicket(roomId, peerId),
            signMessage: async (content, messageId) => {
                const identity = await getOrCreateIdentity();
                const signature = await signPayload(
                    identity.privateKey,
                    `${messageId}|${content}`,
                );
                return { did: identity.did, signature };
            },
            verifyMessage: (did, signature, signedPayload) =>
                verifyPayload(did, signature, signedPayload),
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

        mesh.on("gossip-stats", (stats) => {
            onGossipStats?.(stats);
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
    }, [roomId, userId, enabled, onMessage, onGossipStats]);

    const sendP2P = async (content: string, id?: string) => {
        await meshRef.current?.send(content, id);
    };

    return { sendP2P, connectedPeers, isReady, mesh: meshRef.current };
}
