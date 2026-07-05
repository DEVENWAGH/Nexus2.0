"use client";

import React, { useState } from "react";
import qs from "query-string";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-mode-store";
import { ServerWithMembersWithProfile } from "@/types/types";
import { ScrollArea } from "../ui/scroll-area";
import UserAvatar from "../user-avatar";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { MemberRole } from "@repo/db";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
    Check,
    Gavel,
    Loader2,
    MoreVertical,
    Shield,
    ShieldCheck,
    ShieldQuestion,
} from "lucide-react";
import axios from "axios";
import { useRouter } from "next/navigation";

import { ModalHeaderNav } from "./modal-header-nav";

const MembersModal = () => {
    const router = useRouter();
    const { onOpen, isOpen, onClose, type, data } = useModal();
    const [loadingId, setLoadingId] = useState("");

    const isModalOpen = isOpen && type == "members";
    const { server } = data as { server: ServerWithMembersWithProfile };

    const getRoleColor = (role: MemberRole) => {
        switch (role) {
            case MemberRole.ADMIN:
                return "bg-red-500/10 text-red-500 border-red-500/20";
            case MemberRole.MODERATOR:
                return "bg-blue-500/10 text-blue-500 border-blue-500/20";
            default:
                return "bg-gray-500/10 text-gray-500 border-gray-500/20";
        }
    };

    const onKick = async (memberId: string) => {
        try {
            setLoadingId(memberId);
            const url = qs.stringifyUrl({
                url: `/api/members/${memberId}`,
                query: {
                    serverId: server?.id,
                },
            });
            const response = await axios.delete(url);
            router.refresh();
            onOpen("members", { server: response.data });
        } catch (error) {
            console.log("unable to remove user", error);
        } finally {
            setLoadingId("");
        }
    };

    const onRoleChange = async (memberId: string, role: MemberRole) => {
        try {
            setLoadingId(memberId);
            const url = qs.stringifyUrl({
                url: `/api/members/${memberId}`,
                query: {
                    serverId: server.id,
                },
            });
            const response = await axios.patch(url, { role });
            // router.refresh()
            onOpen("members", { server: response.data });
        } catch (error) {
            console.log("unable to change role", error);
        } finally {
            setLoadingId("");
        }
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="bg-background text-foreground pb-4 overflow-hidden max-w-md p-0">
                <DialogHeader className="pt-8 px-6 pb-0">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Manage Members
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground pb-2">
                        {server?.members?.length}{" "}
                        {server?.members?.length === 1 ? "member" : "members"}
                    </DialogDescription>
                </DialogHeader>
                <ModalHeaderNav server={server} activeType="members" />
                <ScrollArea className="mt-6 max-h-96 px-6">
                    <div className="space-y-4">
                        {server?.members?.map((member, index) => (
                            <React.Fragment key={member.id}>
                                <div className="flex items-center gap-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                                    <UserAvatar
                                        src={member.profile.imageUrl}
                                        className="h-10 w-10"
                                    />
                                    <div className="flex flex-col gap-y-1 flex-1">
                                        <div className="text-sm font-semibold flex items-center gap-x-2">
                                            {member.profile.name}
                                            <Badge
                                                variant="outline"
                                                className={`text-xs px-2 py-0.5 ${getRoleColor(member.role)}`}
                                            >
                                                {member.role.toLowerCase()}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {member.profile.email}
                                        </div>
                                    </div>
                                    {server.profileId !== member.profileId &&
                                        loadingId !== member.id && (
                                            <div className="ml-auto">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger className="bg-secondary/50 p-1.5 rounded-md hover:bg-secondary">
                                                        <MoreVertical className="h-4 w-4 outline-none" />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent side="left">
                                                        <DropdownMenuSub>
                                                            <DropdownMenuSubTrigger className="flex items-center">
                                                                <ShieldQuestion
                                                                    className="h-4 w-4 mr-2
                                                            "
                                                                />
                                                                <span>
                                                                    Role
                                                                </span>
                                                            </DropdownMenuSubTrigger>
                                                            <DropdownMenuPortal>
                                                                <DropdownMenuSubContent>
                                                                    <DropdownMenuItem
                                                                        onClick={() =>
                                                                            onRoleChange(
                                                                                member.id,
                                                                                "GUEST",
                                                                            )
                                                                        }
                                                                    >
                                                                        <Shield className="h-4 w-4 mr-2" />
                                                                        Guest
                                                                        {member.role ==
                                                                            "GUEST" && (
                                                                            <Check className="h-4 w-4 ml-auto" />
                                                                        )}
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        onClick={() =>
                                                                            onRoleChange(
                                                                                member.id,
                                                                                "MODERATOR",
                                                                            )
                                                                        }
                                                                    >
                                                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                                                        Moderator
                                                                        {member.role ==
                                                                            "MODERATOR" && (
                                                                            <Check className="h-4 w-4 ml-auto" />
                                                                        )}
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuSubContent>
                                                            </DropdownMenuPortal>
                                                        </DropdownMenuSub>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                onKick(
                                                                    member.id,
                                                                )
                                                            }
                                                        >
                                                            <Gavel className="h-4 w-4 mr-2" />
                                                            Kick
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        )}
                                    {loadingId === member.id && (
                                        <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                                    )}
                                </div>
                                {index < server.members.length - 1 && (
                                    <Separator className="my-2" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default MembersModal;
