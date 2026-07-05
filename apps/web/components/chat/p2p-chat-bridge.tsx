"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import { P2PMesh, type P2PChatMessage } from "@repo/p2p";
import type { Member, Message, Profile } from "@repo/db";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { upsertChatMessage } from "@/lib/chat-cache";
import { useP2PChat } from "@/hooks/use-p2p-chat";

type MessageWithMemberProfile = Message & {
    member: Member & { profile: Profile };
    blockchainHash?: string | null;
};

type P2PChatContextValue = {
    sendP2P: (content: string, id?: string) => Promise<void>;
    connectedPeers: number;
    isReady: boolean;
    mesh: P2PMesh | null;
};

const P2PChatContext = createContext<P2PChatContextValue>({
    sendP2P: async () => {},
    connectedPeers: 0,
    isReady: false,
    mesh: null,
});

export const useP2PChatContext = () => useContext(P2PChatContext);

type P2PChatBridgeProps = {
    roomId: string;
    queryKey: string;
    paramKey: "channelId" | "conversationId";
    currentMember: Member;
    children: ReactNode;
};

/**
 * Bridges WebRTC P2P messages into the React Query chat cache.
 * Signaling relay only — message payloads travel peer-to-peer.
 */
export const P2PChatBridge = ({
    roomId,
    queryKey,
    paramKey,
    currentMember,
    children,
}: P2PChatBridgeProps) => {
    const queryClient = useQueryClient();
    const { userId } = useAuth();

    const onMessage = useCallback(
        (p2pMessage: P2PChatMessage) => {
            if (p2pMessage.fromUserId === userId) {
                return;
            }

            const message = {
                id: p2pMessage.id,
                content: p2pMessage.content,
                fileUrl: null,
                memberId: currentMember.id,
                ...(paramKey === "channelId"
                    ? { channelId: roomId }
                    : { conversationId: roomId }),
                deleted: false,
                createdAt: new Date(p2pMessage.timestamp),
                updatedAt: new Date(p2pMessage.timestamp),
                member: {
                    ...currentMember,
                    profile: {
                        id: currentMember.profileId,
                        userId: p2pMessage.fromUserId ?? p2pMessage.fromPeerId,
                        name: p2pMessage.fromUserId ?? "Peer",
                        imageUrl: "",
                        email: "",
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
            } as MessageWithMemberProfile;

            queryClient.setQueryData(
                [queryKey],
                (
                    oldData:
                        | InfiniteData<{ items: MessageWithMemberProfile[] }>
                        | undefined,
                ) => upsertChatMessage(oldData, message),
            );
        },
        [queryClient, queryKey, roomId, currentMember, paramKey, userId],
    );

    const { sendP2P, connectedPeers, isReady, mesh } = useP2PChat({
        roomId,
        enabled: Boolean(roomId),
        onMessage,
    });

    const value = useMemo(
        () => ({ sendP2P, connectedPeers, isReady, mesh }),
        [sendP2P, connectedPeers, isReady, mesh],
    );

    return (
        <P2PChatContext.Provider value={value}>
            {children}
        </P2PChatContext.Provider>
    );
};
