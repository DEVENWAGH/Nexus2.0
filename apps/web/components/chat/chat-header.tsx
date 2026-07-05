"use client";

import { Hash, Settings, UserPlus, Users, PlusCircle, Volume2, Video } from "lucide-react";
import UserAvatar from "../user-avatar";
import { SocketIndicator } from "../socket-indicator";
import { ChatVideoButton } from "./chat-video-button";
import { CronCountdownHeader } from "./cron-countdown-header";
import { MemberRole } from "@repo/db";
import { ServerWithMembersWithProfile } from "@/types/types";
import { useModal } from "@/hooks/use-mode-store";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

interface ChatHeaderProps {
    serverId: string;
    name: string;
    type: "channel" | "conversation";
    imageUrl?: string;
    currentMemberId?: string;
    recipientUserId?: string;
    recipientMemberId?: string;
    conversationId?: string;
    channelType?: "TEXT" | "AUDIO" | "VIDEO";
    role?: MemberRole;
    server?: ServerWithMembersWithProfile;
    mobileToggle?: React.ReactNode;
}

const ChatHeader = ({
    serverId,
    name,
    type,
    imageUrl,
    currentMemberId,
    recipientUserId,
    recipientMemberId,
    conversationId,
    channelType,
    role,
    server,
    mobileToggle,
}: ChatHeaderProps) => {
    const { onOpen } = useModal();
    const isAdmin = role === MemberRole.ADMIN;
    const isModerator = role === MemberRole.ADMIN || role === MemberRole.MODERATOR;

    return (
        <div className="text-md font-semibold  px-3 flex items-center border-b h-12 bg-secondary border-primary/10">
            {mobileToggle}
            {type === "channel" && (
                <>
                    {channelType === "AUDIO" ? (
                        <Volume2 className="w-6 h-5 mr-1 text-zinc-400" />
                    ) : channelType === "VIDEO" ? (
                        <Video className="w-6 h-5 mr-1 text-zinc-400" />
                    ) : (
                        <Hash className="w-6 h-5 mr-1 text-zinc-400" />
                    )}
                </>
            )}
            {type === "conversation" && (
                <>
                    <UserAvatar src={imageUrl} className="w-6 h-6 mr-2" />
                </>
            )}
            <p className="font-semibold text-md">{name}</p>
            <div className="ml-auto flex items-center">
                {/* Video call button for conversations */}
                {type === "conversation" && (
                    <ChatVideoButton
                        currentMemberId={currentMemberId}
                        recipientUserId={recipientUserId}
                        recipientMemberId={recipientMemberId}
                        recipientName={name}
                        recipientImageUrl={imageUrl}
                        conversationId={conversationId}
                        serverId={serverId}
                    />
                )}
                {/* Self-Destruct Midnight Purge Timer */}
                <CronCountdownHeader />
                
                {/* Server settings dropdown shortcut */}
                {type === "channel" && isModerator && server && (
                    <div className="mr-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-zinc-700/10 dark:hover:bg-zinc-700/50 cursor-pointer"
                                >
                                    <Settings className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-56 text-xs font-medium text-black dark:text-neutral-400 space-y-0.5"
                                align="end"
                            >
                                <DropdownMenuItem className="px-3 py-1.5 text-xs font-bold text-zinc-400 dark:text-zinc-500 pointer-events-none select-none uppercase">
                                    Server Controls
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onOpen("invite", { server })}
                                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center"
                                >
                                    Invite People
                                    <UserPlus className="h-4 w-4 ml-auto" />
                                </DropdownMenuItem>
                                {isAdmin && (
                                    <DropdownMenuItem
                                        onClick={() => onOpen("editServer", { server })}
                                        className="px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center"
                                    >
                                        Server Settings
                                        <Settings className="h-4 w-4 ml-auto" />
                                    </DropdownMenuItem>
                                )}
                                {isAdmin && (
                                    <DropdownMenuItem
                                        onClick={() => onOpen("members", { server })}
                                        className="px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center"
                                    >
                                        Manage Members
                                        <Users className="h-4 w-4 ml-auto" />
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={() => onOpen("createChannel", { server })}
                                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent flex items-center"
                                >
                                    Create Channel
                                    <PlusCircle className="h-4 w-4 ml-auto" />
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}

                <SocketIndicator
                    recipientUserId={
                        type === "conversation" ? recipientUserId : undefined
                    }
                />
            </div>
        </div>
    );
};

export default ChatHeader;
