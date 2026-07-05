"use client";

import { useModal } from "@/hooks/use-mode-store";
import { useUser } from "@clerk/nextjs";
import { Settings, UserPlus, Users, PlusCircle } from "lucide-react";
import { MemberRole } from "@repo/db";
import { ServerWithMembersWithProfile } from "@/types/types";

interface ModalHeaderNavProps {
    server?: ServerWithMembersWithProfile;
    activeType: "invite" | "editServer" | "members" | "createChannel";
}

export const ModalHeaderNav = ({ server, activeType }: ModalHeaderNavProps) => {
    const { onOpen } = useModal();
    const { user } = useUser();

    if (!server) return null;

    const currentMember = server.members?.find(
        (m) => m.profile?.userId === user?.id
    );
    const userRole = currentMember?.role;
    const isAdmin =
        userRole === MemberRole.ADMIN ||
        server.profileId === currentMember?.profileId;
    const isModerator =
        isAdmin || userRole === MemberRole.MODERATOR;

    return (
        <div className="flex items-center justify-center gap-x-2 px-6 py-3 border-b border-primary/10 bg-secondary/15">
            {isModerator && (
                <button
                    type="button"
                    onClick={() => onOpen("invite", { server })}
                    className={`flex items-center gap-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        activeType === "invite"
                            ? "bg-primary-color text-white shadow-sm"
                            : "text-zinc-500 hover:bg-secondary/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                    <UserPlus className="h-3.5 w-3.5" />
                    Invite
                </button>
            )}
            {isAdmin && (
                <button
                    type="button"
                    onClick={() => onOpen("editServer", { server })}
                    className={`flex items-center gap-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        activeType === "editServer"
                            ? "bg-primary-color text-white shadow-sm"
                            : "text-zinc-500 hover:bg-secondary/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                </button>
            )}
            {isAdmin && (
                <button
                    type="button"
                    onClick={() => onOpen("members", { server })}
                    className={`flex items-center gap-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        activeType === "members"
                            ? "bg-primary-color text-white shadow-sm"
                            : "text-zinc-500 hover:bg-secondary/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                    <Users className="h-3.5 w-3.5" />
                    Members
                </button>
            )}
            {isModerator && (
                <button
                    type="button"
                    onClick={() => onOpen("createChannel", { server })}
                    className={`flex items-center gap-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        activeType === "createChannel"
                            ? "bg-primary-color text-white shadow-sm"
                            : "text-zinc-500 hover:bg-secondary/80 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Channel
                </button>
            )}
        </div>
    );
};
