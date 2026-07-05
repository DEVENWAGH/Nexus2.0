"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import {
    useLocalParticipant,
    useParticipants,
    useTracks,
    useRoomContext,
    RoomAudioRenderer,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MessageSquare, X } from "lucide-react";
import { ParticipantTile } from "./participant-tile";
import { VoiceControls } from "./voice-controls";
import { VoiceChat } from "./voice-chat";
import { P2PChatBridge } from "@/components/chat/p2p-chat-bridge";
import { ChatContentWrapper } from "@/components/chat/chat-content-wrapper";
import ChatMessages from "@/components/chat/chat-messages";
import ChatInput from "@/components/chat/chat-input";
import type { Member } from "@repo/db";

interface VoiceRoomProps {
    chatId: string;
    channelName: string;
    currentMember?: Member;
    serverId?: string;
    type?: "channel" | "conversation";
}

export function VoiceRoom({
    chatId,
    channelName,
    currentMember,
    serverId,
    type = "channel",
}: VoiceRoomProps) {
    const [chatOpen, setChatOpen] = useState(false);
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();
    const room = useRoomContext();

    // Grab all camera + screen share tracks across all participants
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { duration: 0.4, ease: "easeOut" },
        },
    };

    const participantCount = participants.length;

    // Compute grid cols based on participant count to prevent overflow and look good
    const gridCols =
        participantCount <= 2
            ? "grid-cols-1 md:grid-cols-2"
            : participantCount <= 4
              ? "grid-cols-2"
              : participantCount <= 6
                ? "grid-cols-2 md:grid-cols-3"
                : participantCount <= 9
                  ? "grid-cols-3 md:grid-cols-4"
                  : "grid-cols-4 md:grid-cols-5";

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 flex flex-col w-full bg-background overflow-hidden relative"
        >
            {/* Render all remote audio tracks */}
            <RoomAudioRenderer />

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Participant grid */}
                <div className="flex-1 overflow-auto p-4">
                    {participantCount === 0 ? (
                        <EmptyState channelName={channelName} />
                    ) : (
                        <motion.div
                            layout
                            className={`grid ${gridCols} gap-3 auto-rows-fr h-full`}
                        >
                            <AnimatePresence>
                                {tracks.map((trackRef) => (
                                    <ParticipantTile
                                        key={`${trackRef.participant.identity}-${trackRef.source}`}
                                        trackRef={trackRef}
                                    />
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>

                {/* Lobby chat panel */}
                <AnimatePresence>
                    {chatOpen && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 350, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 40 }}
                            className="border-l border-border bg-background shrink-0 flex flex-col overflow-hidden w-[350px]"
                        >
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
                                <span className="text-sm font-semibold text-foreground">
                                    {type === "conversation" ? "Direct Messages" : "Lobby Chat"}
                                </span>
                                <button
                                    onClick={() => setChatOpen(false)}
                                    className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            {currentMember && serverId ? (
                                <P2PChatBridge
                                    roomId={chatId}
                                    queryKey={`chat:${chatId}`}
                                    paramKey={type === "conversation" ? "conversationId" : "channelId"}
                                    currentMember={currentMember}
                                >
                                    <ChatContentWrapper>
                                        <ChatMessages
                                            member={currentMember}
                                            chatId={chatId}
                                            name={channelName}
                                            type={type}
                                            apiUrl={type === "conversation" ? "/api/direct-messages" : "/api/messages"}
                                            socketUrl={type === "conversation" ? "/api/direct-messages" : "/api/messages"}
                                            socketQuery={
                                                type === "conversation"
                                                    ? { conversationId: chatId }
                                                    : { channelId: chatId, serverId: serverId }
                                            }
                                            paramKey={type === "conversation" ? "conversationId" : "channelId"}
                                            paramValue={chatId}
                                        />
                                        <div className="p-4">
                                            <ChatInput
                                                name={channelName}
                                                type={type}
                                                apiUrl={type === "conversation" ? "/api/direct-messages" : "/api/messages"}
                                                query={
                                                    type === "conversation"
                                                        ? { conversationId: chatId }
                                                        : { channelId: chatId, serverId: serverId }
                                                }
                                            />
                                        </div>
                                    </ChatContentWrapper>
                                </P2PChatBridge>
                            ) : (
                                <VoiceChat chatId={chatId} />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Control bar */}
            <VoiceControls
                onToggleChat={() => setChatOpen((o) => !o)}
                chatOpen={chatOpen}
                channelName={channelName}
            />
        </motion.div>
    );
}

function EmptyState({ channelName }: { channelName: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-col items-center justify-center h-full gap-4 text-center"
        >
            <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#5865f2] to-[#ec48bd] flex items-center justify-center shadow-2xl shadow-[#5865f2]/40">
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z" />
                    </svg>
                </div>
                <div className="absolute -inset-2 rounded-full border-2 border-[#5865f2]/30 animate-ping" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-white">
                    #{channelName}
                </h3>
                <p className="text-sm text-white/50 mt-1 max-w-xs">
                    You&apos;re the first one here. Invite others to join the voice channel!
                </p>
            </div>
        </motion.div>
    );
}
