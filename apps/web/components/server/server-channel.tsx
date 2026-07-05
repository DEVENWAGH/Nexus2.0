"use client";
import React, { useState, useEffect } from "react";
import {
    HashIcon,
    Volume2,
    TvMinimalPlay,
    Edit,
    Trash,
    Lock,
} from "lucide-react";
import { ChannelType, MemberRole } from "@repo/db";
import type { Channel, Server } from "@repo/db";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ActionTooltip from "../action-tooltip";
import { useModal } from "@/hooks/use-mode-store";
import UserAvatar from "../user-avatar";

import { useUnread } from "@/components/providers/unread-provider";

interface ServerChannelProps {
    channel: Channel;
    server: Server;
    role?: MemberRole;
}

const iconMap: Record<ChannelType, React.ReactNode> = {
    [ChannelType.TEXT]: (
        <HashIcon className="h-4 w-4 text-muted-foreground mr-2" />
    ),
    [ChannelType.AUDIO]: (
        <Volume2 className="h-4 w-4 text-muted-foreground mr-2" />
    ),
    [ChannelType.VIDEO]: (
        <TvMinimalPlay className="h-4 w-4 text-muted-foreground mr-2" />
    ),
};

const ServerChannel = ({ channel, server, role }: ServerChannelProps) => {
    const params = useParams();
    const router = useRouter();
    const isActive = params?.channelId === channel.id;
    const { onOpen } = useModal();
    const { getUnreadCount } = useUnread();

    const [activeParticipants, setActiveParticipants] = useState<{ name: string; avatar: string }[]>([]);

    const isVoice = channel.type === ChannelType.AUDIO || channel.type === ChannelType.VIDEO;

    useEffect(() => {
        if (!isVoice) return;

        const fetchParticipants = async () => {
            try {
                const resp = await fetch(`/api/livekit/participants?room=${channel.id}`);
                if (resp.ok) {
                    const data = await resp.json();
                    setActiveParticipants(data.participants || []);
                }
            } catch (e) {
                console.error("Failed to fetch active participants in sidebar:", e);
            }
        };

        fetchParticipants();
        const interval = setInterval(fetchParticipants, 10000);
        return () => clearInterval(interval);
    }, [channel.id, isVoice]);

    const unreadCount = getUnreadCount(channel.id);
    const isUnread = unreadCount > 0;

    const onClick = () => {
        const sid = params?.serverId ?? server?.id;
        router.push(`/servers/${sid}/channels/${channel.id}`);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
        }
    };

    return (
        <div className="flex flex-col w-full">
            <div
                role="button"
                tabIndex={0}
                aria-current={isActive ? "true" : undefined}
                onClick={onClick}
                onKeyDown={onKeyDown}
                title={channel.name}
                className={cn(
                    "flex items-center w-full min-w-0 px-2 py-1 rounded-md hover:bg-primary/10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group",
                    isActive && "bg-primary/10 text-primary font-medium",
                    isUnread && !isActive && "text-zinc-900 dark:text-zinc-100 font-bold bg-primary/5",
                )}
            >
                <span className={cn(
                    "text-sm flex gap-2 items-center min-w-0 flex-1 truncate",
                    isUnread && !isActive && "text-zinc-900 dark:text-zinc-100 font-extrabold"
                )}>
                    {iconMap[channel.type]}
                    {channel.name}
                    {isUnread && !isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse ml-auto" />
                    )}
                </span>
                {channel.name !== "general" && role !== MemberRole.GUEST && (
                    <div className="ml-auto flex items-center gap-x-2">
                        <ActionTooltip label="Edit">
                            <button
                                type="button"
                                aria-label={`Edit ${channel.name}`}
                                className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150 p-1 rounded"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpen("editChannel", { server, channel });
                                }}
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                        </ActionTooltip>
                        <ActionTooltip label="Delete">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpen("deleteChannel", { server, channel });
                                }}
                                aria-label={`Delete ${channel.name}`}
                                className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-150 p-1 rounded text-destructive"
                            >
                                <Trash className="w-4 h-4" />
                            </button>
                        </ActionTooltip>
                    </div>
                )}
                {channel.name === "general" && role !== MemberRole.GUEST && (
                    <div className="ml-auto flex items-center gap-x-2">
                        <ActionTooltip label="Locked">
                            <span className="text-muted-foreground">
                                <Lock className="w-4 h-4" />
                            </span>
                        </ActionTooltip>
                    </div>
                )}
            </div>

            {/* Active participants list (Discord Style) */}
            {isVoice && activeParticipants.length > 0 && (
                <div className="flex flex-col gap-1.5 pl-6 pr-2 py-1 mt-0.5 border-l border-primary/5 ml-4">
                    {activeParticipants.map((p, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-default"
                        >
                            <UserAvatar
                                src={p.avatar}
                                name={p.name}
                                className="w-4 h-4 md:w-4 md:h-4 border border-border"
                            />
                            <span className="truncate text-[11px] font-medium">{p.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ServerChannel;
