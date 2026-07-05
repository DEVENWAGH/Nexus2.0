"use client";

import { useCall } from "@/hooks/use-call";
import { useAuth, useUser } from "@clerk/nextjs";
import { Video, VideoOff } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import qs from "query-string";
import ActionTooltip from "../action-tooltip";

interface ChatVideoButtonProps {
    currentMemberId?: string;
    recipientUserId?: string;
    recipientMemberId?: string;
    recipientName?: string;
    recipientImageUrl?: string;
    conversationId?: string;
    serverId?: string;
}

export const ChatVideoButton = ({
    currentMemberId,
    recipientUserId,
    recipientMemberId,
    recipientName,
    recipientImageUrl,
    conversationId,
    serverId,
}: ChatVideoButtonProps) => {
    const { user } = useUser();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isVideo = searchParams?.get("video");
    const { userId } = useAuth();
    const { initiateCall, endCall } = useCall();

    const onClick = () => {
        if (isVideo) {
            endCall();

            const url = qs.stringifyUrl(
                {
                    url: pathname || "",
                    query: {
                        video: undefined,
                    },
                },
                { skipNull: true },
            );
            router.push(url);
        } else {
            // Initiate call via socket
            if (
                userId &&
                currentMemberId &&
                recipientUserId &&
                recipientMemberId &&
                recipientName &&
                conversationId &&
                user
            ) {
                initiateCall(
                    userId,
                    currentMemberId,
                    user.firstName || user.username || "Unknown",
                    user.imageUrl,
                    recipientUserId,
                    recipientMemberId,
                    recipientName,
                    recipientImageUrl || "",
                    conversationId,
                    serverId,
                    "video",
                );
            }
        }
    };

    const Icon = isVideo ? VideoOff : Video;
    const toolTipLabel = isVideo ? "End video call" : "Start video call";

    return (
        <ActionTooltip side="bottom" label={toolTipLabel}>
            <button
                onClick={onClick}
                className="flex items-center justify-center w-8 h-8 rounded-xl mr-2 transition-all duration-200 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
                <Icon className="w-5 h-5" />
            </button>
        </ActionTooltip>
    );
};
