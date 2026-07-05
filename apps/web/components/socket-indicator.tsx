"use client";

import { useSocket } from "./providers/socket-provider";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Wifi, WifiOff, Radio } from "lucide-react";
import ActionTooltip from "./action-tooltip";

interface SocketIndicatorProps {
    recipientUserId?: string;
}

export const SocketIndicator = ({ recipientUserId }: SocketIndicatorProps) => {
    const { isConnected } = useSocket();

    const { data } = useQuery({
        queryKey: ["user-status", recipientUserId],
        queryFn: async () => {
            const res = await axios.get(`/api/users/${recipientUserId}/status`);
            return res.data as { isLive: boolean };
        },
        enabled: !!recipientUserId,
        refetchInterval: 10000,
    });

    // User status indicator (for conversations)
    if (recipientUserId) {
        if (data?.isLive) {
            return (
                <ActionTooltip side="bottom" label="Online">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl mr-2 bg-emerald-500/10 dark:bg-emerald-500/20">
                        <Radio className="w-5 h-5 text-emerald-600 dark:text-emerald-500 animate-pulse" />
                    </div>
                </ActionTooltip>
            );
        }

        return (
            <ActionTooltip side="bottom" label="Offline">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl mr-2 bg-zinc-100 dark:bg-zinc-800">
                    <Radio className="w-5 h-5 text-zinc-500 dark:text-zinc-500" />
                </div>
            </ActionTooltip>
        );
    }

    // Socket connection indicator (for channels)
    if (!isConnected) {
        return (
            <ActionTooltip side="bottom" label="Reconnecting">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl mr-2 bg-amber-500/10 dark:bg-amber-500/20">
                    <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-500 animate-pulse" />
                </div>
            </ActionTooltip>
        );
    }

    return (
        <ActionTooltip side="bottom" label="Connected">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl mr-2 bg-emerald-500/10 dark:bg-emerald-500/20">
                <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            </div>
        </ActionTooltip>
    );
};
