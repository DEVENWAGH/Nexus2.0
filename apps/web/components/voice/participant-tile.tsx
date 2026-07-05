"use client";

import React from "react";
import { motion } from "motion/react";
import {
    VideoTrack,
    AudioTrack,
    useIsSpeaking,
    useParticipantInfo,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder, TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Mic, MicOff, VideoOff } from "lucide-react";

interface ParticipantTileProps {
    trackRef: TrackReferenceOrPlaceholder;
}

export function ParticipantTile({ trackRef }: ParticipantTileProps) {
    const { name, identity } = useParticipantInfo({ participant: trackRef.participant });
    const isSpeaking = useIsSpeaking(trackRef.participant);

    const metadata = trackRef.participant?.metadata ? (() => {
        try {
            return JSON.parse(trackRef.participant.metadata);
        } catch {
            return { avatar: trackRef.participant.metadata };
        }
    })() : {};
    const avatarUrl = metadata?.avatar || "";

    const hasVideo =
        trackRef.publication?.isSubscribed &&
        !trackRef.publication.isMuted &&
        trackRef.source === Track.Source.Camera;

    const isScreenShare = trackRef.source === Track.Source.ScreenShare;
    const isMicMuted = !(trackRef.participant?.isMicrophoneEnabled ?? true);

    const displayName = name ?? identity ?? "Unknown";
    const initials = displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    // Only VideoTrack accepts TrackReference (not placeholder)
    const isRealTrack = trackRef.publication !== undefined;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="relative rounded-xl overflow-hidden bg-card border border-border aspect-video group"
        >
            {/* Speaking ring */}
            <motion.div
                animate={isSpeaking ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 rounded-xl border-2 border-emerald-500 z-20 pointer-events-none"
            />

            {/* Screen share badge */}
            {isScreenShare && (
                <div className="absolute top-2 left-2 z-30 bg-[#5865f2] text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow-lg">
                    Screen Share
                </div>
            )}

            {/* Video content */}
            {(hasVideo || isScreenShare) && isRealTrack ? (
                <div className="absolute inset-0">
                    <VideoTrack
                        trackRef={trackRef as TrackReference}
                        className="w-full h-full object-cover"
                    />
                </div>
            ) : (
                /* Avatar placeholder */
                <div className="absolute inset-0 flex items-center justify-center bg-secondary/50">
                    <div className="relative">
                        <motion.div
                            animate={
                                isSpeaking
                                    ? { scale: [1, 1.08, 1] }
                                    : { scale: 1 }
                            }
                            transition={{
                                duration: 0.6,
                                repeat: isSpeaking ? Infinity : 0,
                                ease: "easeInOut",
                            }}
                            className="w-20 h-20 rounded-full overflow-hidden bg-primary-color flex items-center justify-center text-white font-bold text-2xl select-none"
                        >
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt={displayName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                initials
                            )}
                        </motion.div>
                        {isSpeaking && (
                            <motion.div
                                animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                                transition={{
                                    duration: 1,
                                    repeat: Infinity,
                                    ease: "easeOut",
                                }}
                                className="absolute inset-0 rounded-full border-2 border-emerald-500"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Audio rendering — only for camera tracks (not screen share) */}
            {trackRef.source === Track.Source.Camera && isRealTrack && (
                <AudioTrack trackRef={trackRef as TrackReference} />
            )}

            {/* Always-visible Discord-style name tag */}
            <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 rounded-md">
                {isMicMuted && (
                    <div className="text-destructive shrink-0 flex items-center justify-center">
                        <MicOff className="w-3 h-3" />
                    </div>
                )}
                <span className="text-[11px] font-medium text-white truncate max-w-[120px]">
                    {displayName}
                </span>
            </div>
        </motion.div>
    );
}
