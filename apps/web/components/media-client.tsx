"use client";

import { useUser } from "@clerk/nextjs";
import { Loader2, Mic, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import { VoiceRoom } from "@/components/voice/voice-room";
import UserAvatar from "./user-avatar";
import type { Member } from "@repo/db";

interface MediaRoomProps {
    chatId: string;
    video: boolean;
    audio: boolean;
    autoJoin?: boolean;
    channelName?: string;
    currentMember?: Member;
    serverId?: string;
    type?: "channel" | "conversation";
}

export const MediaRoom = ({
    chatId,
    video,
    audio,
    autoJoin = false,
    channelName = "voice",
    currentMember,
    serverId,
    type = "channel",
}: MediaRoomProps) => {
    const { user } = useUser();
    const [token, setToken] = useState("");
    const [isMounted, setIsMounted] = useState(false);
    const [joined, setJoined] = useState(autoJoin);
    const [activeParticipants, setActiveParticipants] = useState<{ name: string; avatar: string }[]>([]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Fetch active participants in room (polling) while NOT joined
    useEffect(() => {
        if (joined) return;

        const fetchParticipants = async () => {
            try {
                const resp = await fetch(`/api/livekit/participants?room=${chatId}`);
                if (resp.ok) {
                    const data = await resp.json();
                    setActiveParticipants(data.participants || []);
                }
            } catch (e) {
                console.error("Failed to fetch active participants", e);
            }
        };

        fetchParticipants();
        const interval = setInterval(fetchParticipants, 5000);
        return () => clearInterval(interval);
    }, [chatId, joined]);

    useEffect(() => {
        if (!joined) return;
        if (!user?.id || !user?.firstName) return;

        const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
        const avatarUrl = user.imageUrl || "";

        const fetch_token = async () => {
            try {
                const resp = await fetch(
                    `/api/livekit?room=${chatId}&identity=${user.id}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatarUrl)}`,
                );
                const data = await resp.json();
                setToken(data.token);
            } catch (e) {
                console.error("Failed to fetch LiveKit token", e);
            }
        };
        fetch_token();
    }, [user?.id, user?.firstName, user?.lastName, user?.imageUrl, chatId, joined]);

    if (!isMounted) return null;

    /* ── Join Screen ───────────────────────────────────────────── */
    if (!joined) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center flex-1 gap-5 bg-background p-4 text-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
                {/* Icon */}
                <div className="relative">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-[#5865f2] to-[#ec48bd] overflow-hidden flex items-center justify-center shadow-2xl shadow-[#5865f2]/40">
                        {user?.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt={user.fullName ?? "User logo"}
                                className="w-full h-full object-cover"
                            />
                        ) : video ? (
                            <Video className="h-8 w-8 md:h-10 md:w-10 text-white" />
                        ) : (
                            <Mic className="h-8 w-8 md:h-10 md:w-10 text-white" />
                        )}
                    </div>
                    {/* Pulse rings */}
                    <div className="absolute -inset-3 rounded-full border-2 border-[#5865f2]/20 animate-ping" />
                    <div className="absolute -inset-6 rounded-full border border-[#5865f2]/10 animate-ping [animation-delay:200ms]" />
                </div>

                {/* Text */}
                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">
                        #{channelName}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                        Voice channel · microphone, camera, and screen sharing available once you join
                    </p>
                </div>

                {/* Device preview info */}
                <div className="flex items-center gap-6 text-xs text-muted-foreground/60">
                    <div className="flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5" />
                        <span>Microphone</span>
                    </div>
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5" />
                        <span>Camera (optional)</span>
                    </div>
                </div>

                {/* Already in channel section */}
                {activeParticipants.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-2 bg-secondary/50 border border-border p-3.5 rounded-xl max-w-sm w-full"
                    >
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Active in lobby ({activeParticipants.length})
                        </p>
                        <div className="flex items-center justify-center -space-x-2 mt-1">
                            {activeParticipants.map((p, idx) => (
                                <UserAvatar
                                    key={idx}
                                    src={p.avatar}
                                    name={p.name}
                                    className="w-8 h-8 border-2 border-background shadow-sm hover:scale-110 transition-transform cursor-default"
                                />
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium truncate max-w-xs">
                            {activeParticipants.map((p) => p.name).join(", ")}
                        </p>
                    </motion.div>
                )}

                {/* Join button */}
                <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setJoined(true)}
                    className="px-10 py-3.5 rounded-xl bg-gradient-to-r from-[#5865f2] to-[#4752c4] text-white font-semibold text-sm shadow-lg shadow-[#5865f2]/30 hover:shadow-xl hover:shadow-[#5865f2]/40 transition-shadow"
                >
                    Join Voice Channel
                </motion.button>
            </motion.div>
        );
    }

    /* ── Loading token ─────────────────────────────────────────── */
    if (token === "") {
        return (
            <div className="flex items-center justify-center flex-1 flex-col gap-3 bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-[#5865f2]" />
                <p className="text-sm text-muted-foreground">Connecting to voice channel...</p>
            </div>
        );
    }

    /* ── LiveKit Room ──────────────────────────────────────────── */
    return (
        <LiveKitRoom
            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
            token={token}
            connect={true}
            video={false}   // camera starts OFF by default, user toggles in controls
            audio={audio}
            onError={(e) => console.error("LiveKit Room Error:", e)}
            onDisconnected={() => {
                setJoined(false);
                setToken("");
            }}
            className="flex flex-col h-full w-full bg-background"
        >
            <VoiceRoom
                chatId={chatId}
                channelName={channelName}
                currentMember={currentMember}
                serverId={serverId}
                type={type}
            />
        </LiveKitRoom>
    );
};
