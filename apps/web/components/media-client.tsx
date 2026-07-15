"use client";

import { useUser } from "@/hooks/use-auth";
import { useCall } from "@/hooks/use-call";
import { Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { P2PVoiceRoom } from "@/components/voice/p2p-voice-room";
import UserAvatar from "./user-avatar";
import axios from "axios";
import { usePathname, useRouter } from "next/navigation";
import qs from "query-string";

interface MediaRoomProps {
    chatId: string;
    video: boolean;
    audio: boolean;
    autoJoin?: boolean;
    channelName?: string;
    currentMember?: any;
    serverId?: string;
    type?: "channel" | "conversation";
    members?: any[];
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
    const { endCall, callState } = useCall();
    const router = useRouter();
    const pathname = usePathname();
    const [isMounted, setIsMounted] = useState(false);
    const [joined, setJoined] = useState(autoJoin);
    const [activePeers, setActivePeers] = useState<any[]>([]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || joined) return;

        const fetchActivePeers = async () => {
            try {
                const res = await axios.get(`/api/profile/active-peers?roomId=${chatId}`);
                setActivePeers(res.data || []);
            } catch (err) {
                console.error("Failed to load active peers in media-client:", err);
            }
        };

        fetchActivePeers();
        const interval = setInterval(fetchActivePeers, 3000);
        return () => clearInterval(interval);
    }, [isMounted, chatId, joined]);

    if (!isMounted) return null;

    const myUserId = user?.id ?? "anonymous";
    const myName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
    const myImageUrl = user?.imageUrl;

    const leaveVoice = () => {
        if (type === "conversation") {
            endCall(callState.callId ?? undefined);
            const url = qs.stringifyUrl(
                {
                    url: pathname || "",
                    query: { audio: undefined },
                },
                { skipNull: true },
            );
            router.push(url);
            return;
        }
        setJoined(false);
        setActivePeers((prev) => prev.filter((p) => p.userId !== myUserId));
    };

    if (!joined) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="flex flex-col items-center justify-center flex-1 gap-5 bg-background p-4 text-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
                <div className="relative">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-[#5865f2] to-[#ec48bd] overflow-hidden flex items-center justify-center shadow-2xl shadow-[#5865f2]/40">
                        {user?.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt={user.fullName ?? "User logo"}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <Mic className="h-8 w-8 md:h-10 md:w-10 text-white" />
                        )}
                    </div>
                    <div className="absolute -inset-3 rounded-full border-2 border-[#5865f2]/20 animate-ping" />
                    <div className="absolute -inset-6 rounded-full border border-[#5865f2]/10 animate-ping [animation-delay:200ms]" />
                </div>

                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">
                        #{channelName}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                        P2P Voice · End-to-end encrypted WebRTC — no central media server
                    </p>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-emerald-400 font-medium">Decentralized · No SFU relay</span>
                </div>

                <div className="flex items-center gap-2.5 text-xs text-muted-foreground/60">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Microphone Required</span>
                </div>

                {activePeers.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-2 bg-secondary/50 border border-border p-3.5 rounded-xl max-w-sm w-full"
                    >
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Active in Channel ({activePeers.length})
                        </p>
                        <div className="flex items-center justify-center -space-x-2 mt-1">
                            {activePeers.slice(0, 6).map((peer) => (
                                <UserAvatar
                                    key={peer.id}
                                    src={peer.imageUrl}
                                    name={peer.name}
                                    className="w-8 h-8 border-2 border-background shadow-sm hover:scale-110 transition-transform cursor-default"
                                />
                            ))}
                        </div>
                    </motion.div>
                )}

                <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setJoined(true)}
                    className="px-10 py-3.5 rounded-xl bg-gradient-to-r from-[#5865f2] to-[#4752c4] text-white font-semibold text-sm shadow-lg shadow-[#5865f2]/30 hover:shadow-xl hover:shadow-[#5865f2]/40 transition-shadow cursor-pointer"
                >
                    Join Voice Channel
                </motion.button>
            </motion.div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-background">
            <P2PVoiceRoom
                chatId={chatId}
                channelName={channelName}
                myUserId={myUserId}
                myName={myName}
                myImageUrl={myImageUrl}
                enableVideo={video}
                onLeave={leaveVoice}
            />
        </div>
    );
};
