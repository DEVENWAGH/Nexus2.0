import { useSocket } from "@/components/providers/socket-provider";
import { upsertChatMessage } from "@/lib/chat-cache";
import { Member, Message, Profile } from "@repo/db";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

type ChatSocketProvider = {
    addKey: string;
    updateKey: string;
    queryKey: string;
};

type MessageWithMemberWithProfile = Message & {
    member: Member & {
        profile: Profile;
    };
};

export const useChatSocket = ({
    addKey,
    updateKey,
    queryKey,
    chatId,
    type,
}: ChatSocketProvider & {
    chatId: string;
    type: "channel" | "conversation";
}) => {
    const { socket } = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket || !chatId) {
            return;
        }

        // Join room based on type
        const event = type === "channel" ? "join-channel" : "join-conversation";
        const joinRoom = () => {
            socket.emit(event, chatId);
        };
        joinRoom();
        socket.on("connect", joinRoom);

        socket.on(updateKey, (message: MessageWithMemberWithProfile) => {
            queryClient.setQueryData(
                [queryKey],
                (
                    oldData:
                        | InfiniteData<{
                              items: MessageWithMemberWithProfile[];
                          }>
                        | undefined,
                ) => {
                    if (
                        !oldData ||
                        !oldData.pages ||
                        oldData.pages.length === 0
                    ) {
                        return oldData;
                    }
                    const newData = oldData.pages.map((page) => {
                        return {
                            ...page,
                            items: page.items.map(
                                (item: MessageWithMemberWithProfile) => {
                                    if (item.id === message.id) {
                                        return message;
                                    }
                                    return item;
                                },
                            ),
                        };
                    });
                    return {
                        ...oldData,
                        pages: newData,
                    };
                },
            );
        });

        socket.on(addKey, (message: MessageWithMemberWithProfile) => {
            queryClient.setQueryData(
                [queryKey],
                (
                    oldData:
                        | InfiniteData<{
                              items: MessageWithMemberWithProfile[];
                          }>
                        | undefined,
                ) => upsertChatMessage(oldData, message),
            );
        });

        return () => {
            const leaveEvent =
                type === "channel" ? "leave-channel" : "leave-conversation";
            socket.off("connect", joinRoom);
            socket.emit(leaveEvent, chatId);
            socket.off(addKey);
            socket.off(updateKey);
        };
    }, [queryClient, addKey, queryKey, socket, updateKey, chatId, type]);
};
