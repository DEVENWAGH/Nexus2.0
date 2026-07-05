"use client";

import type { Member, Profile, Server } from "@repo/db";
import { useEffect, useState } from "react";
import axios from "axios";
import UserAvatar from "../user-avatar";
import { Tooltip, TooltipTrigger } from "../ui/tooltip";
import { useRouter } from "next/navigation";
import { roleIconMap } from "@/constants/roleIconMap";
import { useUnread } from "@/components/providers/unread-provider";
import { cn } from "@/lib/utils";

interface ServerMemberProps {
    member: Member & { profile: Profile };
    server: Server;
}

const ServerMember = ({ member, server }: ServerMemberProps) => {
    const icon = roleIconMap[member.role];
    const router = useRouter();
    const { getUnreadCount } = useUnread();
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const checkStatus = async () => {
            try {
                const res = await axios.get(`/api/users/${member.profile.userId}/status`);
                if (isMounted) {
                    setIsOnline(res.data.isLive);
                }
            } catch {
                // silently fail
            }
        };

        void checkStatus();
        const interval = setInterval(checkStatus, 8000); // Check status every 8s

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [member.profile.userId]);

    const unreadCount = getUnreadCount(member.id);

    function openConversation() {
        router.push(`/servers/${server.id}/conversation/${member.id}/`);
    }
    return (
        <button
            type="button"
            className="group w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm text-left"
            onClick={openConversation}
        >
            <div className="relative">
                <UserAvatar src={member.profile.imageUrl} />
                {isOnline && (
                    <span 
                        className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-fade-in" 
                        title="Online"
                    />
                )}
            </div>

            <div className="min-w-0 flex-1 flex items-center justify-between">
                <p
                    className={cn(
                        "truncate font-medium text-foreground",
                        unreadCount > 0 && "font-bold text-rose-500 dark:text-rose-400"
                    )}
                    title={member.profile.name}
                >
                    {member.profile.name.length > 10
                        ? member.profile.name.slice(0, 10) + "..."
                        : member.profile.name}
                </p>
                {unreadCount > 0 && (
                    <span className="bg-rose-500 text-white rounded-full text-[9px] font-extrabold h-4.5 min-w-4.5 px-1 flex items-center justify-center shadow-sm animate-pulse ml-2">
                        {unreadCount}
                    </span>
                )}
            </div>

            {icon && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="hidden group-hover:block ml-2 text-muted-foreground">
                            {icon}
                        </span>
                    </TooltipTrigger>
                </Tooltip>
            )}
        </button>
    );
};

export default ServerMember;
