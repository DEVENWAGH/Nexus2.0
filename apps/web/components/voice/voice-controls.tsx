"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    useLocalParticipant,
    useRoomContext,
} from "@livekit/components-react";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    Monitor,
    MonitorOff,
    Settings,
    MessageSquare,
    Phone,
    ChevronUp,
    Check,
    X,
} from "lucide-react";
import { RoomEvent } from "livekit-client";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import UserAvatar from "../user-avatar";

interface VoiceControlsProps {
    onToggleChat: () => void;
    chatOpen: boolean;
    channelName: string;
}

export function VoiceControls({
    onToggleChat,
    chatOpen,
    channelName,
}: VoiceControlsProps) {
    const { user } = useUser();
    const { localParticipant } = useLocalParticipant();
    const room = useRoomContext();
    const router = useRouter();

    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [screenShareEnabled, setScreenShareEnabled] = useState(false);
    const [cameraError, setCameraError] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedMic, setSelectedMic] = useState<string>("");
    const settingsRef = useRef<HTMLDivElement>(null);

    // Fetch audio devices
    useEffect(() => {
        async function loadDevices() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const mics = devices.filter((d) => d.kind === "audioinput");
                setAudioDevices(mics);
                if (mics.length > 0 && !selectedMic) {
                    setSelectedMic(mics[0].deviceId);
                }
            } catch {
                // permissions not yet granted
            }
        }
        loadDevices();
        navigator.mediaDevices.addEventListener("devicechange", loadDevices);
        return () =>
            navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    }, [selectedMic]);

    // Close settings on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setSettingsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Listen to media device errors from the room
    useEffect(() => {
        if (!room) return;

        const handleMediaDeviceError = (error: Error) => {
            console.error("Room media device error:", error);
            // If it's a NotFoundError or mentions camera/video, trigger the modal
            const isCamera = error.name === "NotFoundError" || 
                             error.message.toLowerCase().includes("camera") || 
                             error.message.toLowerCase().includes("video") ||
                             error.message.toLowerCase().includes("requested device not found");
            if (isCamera) {
                setCameraError(true);
            }
        };

        room.on(RoomEvent.MediaDevicesError, handleMediaDeviceError);
        return () => {
            room.off(RoomEvent.MediaDevicesError, handleMediaDeviceError);
        };
    }, [room]);

    const toggleMic = async () => {
        try {
            await localParticipant.setMicrophoneEnabled(!micEnabled);
            setMicEnabled((v) => !v);
        } catch (e) {
            console.error("Failed to toggle mic", e);
        }
    };

    const toggleCamera = async () => {
        try {
            await localParticipant.setCameraEnabled(!cameraEnabled);
            setCameraEnabled((v) => !v);
        } catch (e) {
            console.error("Failed to toggle camera", e);
            setCameraError(true);
        }
    };

    const toggleScreenShare = async () => {
        try {
            await localParticipant.setScreenShareEnabled(!screenShareEnabled);
            setScreenShareEnabled((v) => !v);
        } catch (e) {
            console.error("Failed to toggle screen share", e);
        }
    };

    const switchMic = async (deviceId: string) => {
        setSelectedMic(deviceId);
        setSettingsOpen(false);
        try {
            await room.switchActiveDevice("audioinput", deviceId);
        } catch (e) {
            console.error("Failed to switch mic", e);
        }
    };

    const disconnect = async () => {
        await room.disconnect();
        router.refresh();
    };

    return (
        <div className="shrink-0 border-t border-border bg-background px-6 py-4 flex items-center justify-center">
            <div className="flex items-center gap-3">
                    {/* Mic */}
                    <ControlButton
                        active={micEnabled}
                        onClick={toggleMic}
                        activeIcon={<Mic className="w-5 h-5" />}
                        inactiveIcon={<MicOff className="w-5 h-5" />}
                        activeLabel="Mute mic"
                        inactiveLabel="Unmute mic"
                    />

                    {/* Mic Settings */}
                    <div className="relative" ref={settingsRef}>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSettingsOpen((v) => !v)}
                            className="p-3 rounded-full bg-secondary text-foreground hover:bg-secondary/80 transition-all duration-200 border border-border"
                            aria-label="Mic settings"
                        >
                            <ChevronUp className="w-5 h-5" />
                        </motion.button>

                        <AnimatePresence>
                            {settingsOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in"
                                >
                                    <div className="px-3 py-2.5 border-b border-border">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            Microphone
                                        </p>
                                    </div>
                                    <div className="py-1 max-h-48 overflow-y-auto">
                                        {audioDevices.length === 0 && (
                                            <p className="text-xs text-muted-foreground px-3 py-2">
                                                No microphones found
                                            </p>
                                        )}
                                        {audioDevices.map((device) => (
                                            <button
                                                key={device.deviceId}
                                                onClick={() => switchMic(device.deviceId)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors text-left"
                                            >
                                                <span className="w-4 shrink-0">
                                                    {selectedMic === device.deviceId && (
                                                        <Check className="w-4 h-4 text-primary-color" />
                                                    )}
                                                </span>
                                                <span className="truncate">
                                                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Camera */}
                    <ControlButton
                        active={cameraEnabled}
                        onClick={toggleCamera}
                        activeIcon={<Video className="w-5 h-5" />}
                        inactiveIcon={<VideoOff className="w-5 h-5" />}
                        activeLabel="Turn off camera"
                        inactiveLabel="Turn on camera"
                    />

                    {/* Screen Share */}
                    <ControlButton
                        active={screenShareEnabled}
                        onClick={toggleScreenShare}
                        activeIcon={<Monitor className="w-5 h-5" />}
                        inactiveIcon={<MonitorOff className="w-5 h-5" />}
                        activeLabel="Stop sharing"
                        inactiveLabel="Share screen"
                        activeClass="bg-emerald-500 text-white hover:bg-emerald-600 border-none"
                        inactiveClass="bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                    />

                    {/* Chat toggle */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onToggleChat}
                        className={`p-3 rounded-full transition-all duration-200 ${
                            chatOpen
                                ? "bg-primary-color text-white"
                                : "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                        }`}
                        aria-label="Toggle lobby chat"
                    >
                        <MessageSquare className="w-5 h-5" />
                    </motion.button>

                    {/* Divider */}
                    <div className="w-px h-6 bg-zinc-700 mx-2" />

                    {/* Disconnect */}
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={disconnect}
                        className="p-3 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all duration-200"
                        aria-label="Leave channel"
                    >
                        <Phone className="w-5 h-5 rotate-[135deg]" />
                    </motion.button>
                </div>

            {/* Camera Error Modal */}
            <AnimatePresence>
                {cameraError && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="bg-[#313338] w-full max-w-[440px] rounded-lg shadow-2xl flex flex-col overflow-hidden"
                        >
                            <div className="p-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-zinc-100">Camera Unavailable</h2>
                                <button
                                    onClick={() => setCameraError(false)}
                                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="px-4 pb-6 text-zinc-300 text-[15px]">
                                Uh oh, we can't detect any camera.
                            </div>
                            <div className="bg-[#2b2d31] p-4 flex justify-end">
                                <button
                                    onClick={() => setCameraError(false)}
                                    className="px-6 py-2.5 bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium rounded transition-colors text-sm"
                                >
                                    Okay
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Reusable animated control button ────────────────────────────────────────

interface ControlButtonProps {
    active: boolean;
    onClick: () => void;
    activeIcon: React.ReactNode;
    inactiveIcon: React.ReactNode;
    activeLabel: string;
    inactiveLabel: string;
    activeClass?: string;
    inactiveClass?: string;
}

function ControlButton({
    active,
    onClick,
    activeIcon,
    inactiveIcon,
    activeLabel,
    inactiveLabel,
    activeClass = "bg-secondary text-foreground hover:bg-secondary/80 border border-border",
    inactiveClass = "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-none",
}: ControlButtonProps) {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`relative p-3 rounded-full transition-all duration-200 ${
                active ? activeClass : inactiveClass
            }`}
            aria-label={active ? activeLabel : inactiveLabel}
            title={active ? activeLabel : inactiveLabel}
        >
            <AnimatePresence mode="wait">
                <motion.span
                    key={active ? "active" : "inactive"}
                    initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.7, rotate: 10 }}
                    transition={{ duration: 0.15 }}
                    className="flex"
                >
                    {active ? activeIcon : inactiveIcon}
                </motion.span>
            </AnimatePresence>
        </motion.button>
    );
}
