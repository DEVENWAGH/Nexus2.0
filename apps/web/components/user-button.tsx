"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Wallet } from "lucide-react";
import axios from "axios";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import UserAvatar from "./user-avatar";

import { useModal } from "@/hooks/use-mode-store";

export const UserButton = () => {
    const router = useRouter();
    const { onOpen } = useModal();
    const [profile, setProfile] = useState<any>(null);
    const [isMounted, setIsMounted] = useState(false);


    useEffect(() => {
        setIsMounted(true);
        const fetchProfile = async () => {
            try {
                const res = await axios.get("/api/profile");
                setProfile(res.data);
            } catch (err: any) {
                if (err?.response?.status === 401) {
                    localStorage.removeItem("nexus-user-id");
                    document.cookie = "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
                    setProfile(null);
                } else {
                    console.error("Failed to load profile in user button:", err);
                }
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        try {
            await axios.post("/api/profile/logout");
        } catch (e) {
            console.error("Server logout error:", e);
        }
        // Fallback cookie deletion, clear storage, redirect
        document.cookie = "__session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
        localStorage.removeItem("nexus-user-id");
        router.push("/sign-in");
        router.refresh();
    };


    if (!isMounted) {
        return (
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        );
    }

    const shortAddress = profile?.userId
        ? `${profile.userId.slice(0, 6)}...${profile.userId.slice(-4)}`
        : "Wallet Connected";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="outline-none relative cursor-pointer active:scale-95 transition-all">
                <UserAvatar
                    src={profile?.imageUrl}
                    className="h-8 w-8 border border-indigo-500/20"
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl p-1.5 shadow-2xl">
                <DropdownMenuLabel className="px-2.5 py-2">
                    <div className="flex flex-col gap-0.5">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{profile?.name || "Nexus User"}</p>
                        <p className="text-[10px] font-mono text-indigo-400 font-medium truncate flex items-center gap-1 mt-0.5">
                            <Wallet className="h-3 w-3" />
                            {shortAddress}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-800 my-1" />
                <DropdownMenuItem
                    onClick={() => onOpen("editProfile")}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer outline-none transition-colors text-xs font-medium"
                >
                    <User className="h-3.5 w-3.5 text-zinc-400" />
                    Edit Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-800 my-1" />
                <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer focus:bg-rose-500/10 focus:text-rose-300 outline-none transition-colors text-xs font-medium"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect Wallet
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
