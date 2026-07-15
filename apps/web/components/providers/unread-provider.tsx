"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useSocket } from "./socket-provider";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-auth";
import { isClientEncrypted, decryptForChannel } from "@/lib/client-crypto";
import { getOrCreateIdentity } from "@/hooks/use-identity";


export type UnreadCounts = {
    [chatId: string]: {
        count: number;
        serverId: string | null;
    };
};

type UnreadContextType = {
    unreadCounts: UnreadCounts;
    getUnreadCount: (chatId: string) => number;
    getServerUnreadCount: (serverId: string) => number;
    clearUnread: (chatId: string) => void;
};

const UnreadContext = createContext<UnreadContextType>({
    unreadCounts: {},
    getUnreadCount: () => 0,
    getServerUnreadCount: () => 0,
    clearUnread: () => {},
});

export const useUnread = () => useContext(UnreadContext);

const playNotificationSound = () => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        
        const playTone = (freq: number, start: number, duration: number) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.08, start + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            
            osc.start(start);
            osc.stop(start + duration);
        };

        const now = audioCtx.currentTime;
        playTone(523.25, now, 0.25); // C5
        playTone(659.25, now + 0.08, 0.4); // E5
    } catch (e) {
        console.error("[UnreadProvider] Audio chime failed:", e);
    }
};

const requestNotificationPermission = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
            void Notification.requestPermission();
        }
    }
};

const showDesktopNotification = (title: string, body: string, onClickUrl?: string) => {
    if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        const notification = new Notification(title, {
            body,
            icon: "/icon.png",
        });

        if (onClickUrl) {
            notification.onclick = () => {
                window.focus();
                window.location.href = onClickUrl;
            };
        }
    }
};

export const UnreadProvider = ({ children }: { children: React.ReactNode }) => {
    const { socket } = useSocket();
    const { user } = useUser();
    const params = useParams();
    const pathname = usePathname();
    const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});

    // Load initial counts from localStorage on client-side mount
    useEffect(() => {
        requestNotificationPermission();
        const stored = localStorage.getItem("nexus-unread-counts");
        if (stored) {
            try {
                setUnreadCounts(JSON.parse(stored) as UnreadCounts);
            } catch {
                localStorage.removeItem("nexus-unread-counts");
            }
        }
    }, []);

    // Helper to persist count changes to localStorage
    const saveCounts = (counts: UnreadCounts) => {
        setUnreadCounts(counts);
        localStorage.setItem("nexus-unread-counts", JSON.stringify(counts));
    };

    // Watch active route parameters and clear unread count for the channel/conversation currently being viewed
    useEffect(() => {
        const activeId = (params?.channelId as string) || (params?.conversationId as string);
        if (activeId) {
            clearUnread(activeId);
        }
    }, [params?.channelId, params?.conversationId, pathname]);

    const clearUnread = (chatId: string) => {
        if (unreadCounts[chatId] && unreadCounts[chatId].count > 0) {
            const next = { ...unreadCounts };
            delete next[chatId];
            saveCounts(next);
        }
    };

    const getUnreadCount = (chatId: string) => {
        return unreadCounts[chatId]?.count ?? 0;
    };

    const getServerUnreadCount = (serverId: string) => {
        return Object.values(unreadCounts).reduce((acc, current) => {
            if (current.serverId === serverId) {
                return acc + current.count;
            }
            return acc;
        }, 0);
    };

    // Listen to real-time message notifications from the socket server
    useEffect(() => {
        if (!socket) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleNewMessage = async (data: any) => {
            const { type, serverId, channelId, conversationId, message } = data;
            
            if (message && message.content && isClientEncrypted(message.content)) {
                try {
                    const decryptId = type === "channel" ? channelId : conversationId;
                    const identity = await getOrCreateIdentity();
                    message.content = await decryptForChannel(message.content, decryptId, identity.privateKey);
                } catch (e) {
                    console.error("Failed to decrypt notification message:", e);
                }
            }

            const activeChannelId = params?.channelId as string | undefined;
            const activeConversationId = params?.conversationId as string | undefined;

            let targetId = "";
            let shouldIncrement = false;

            if (type === "channel" && channelId) {
                targetId = channelId;
                // Increment only if we are not actively viewing this channel
                shouldIncrement = activeChannelId !== channelId;
            } else if (type === "conversation" && conversationId) {
                // For DMs, we key unread counts by the sender's member ID
                const senderMemberId = message.member.id;
                targetId = senderMemberId;
                // Increment only if we are not actively viewing this conversation
                shouldIncrement = activeConversationId !== senderMemberId;
            }

            // Check if the current user is mentioned in the channel message content
            let isMentioned = false;
            if (user && type === "channel" && message.content) {
                const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim().toLowerCase();
                const firstName = (user.firstName || "").toLowerCase();
                const username = (user.username || "").toLowerCase();
                const textLower = message.content.toLowerCase();

                isMentioned = 
                    (fullName && textLower.includes(`@${fullName}`)) ||
                    (firstName && new RegExp(`@\\b${firstName}\\b`, 'i').test(message.content)) ||
                    (username && new RegExp(`@\\b${username}\\b`, 'i').test(message.content));
            }


            // Trigger alert if:
            // 1. We are in a different channel/conversation (shouldIncrement is true)
            // 2. OR the user is mentioned and the page is hidden/unfocused
            const shouldAlert = shouldIncrement || (isMentioned && document.visibilityState !== "visible");

            if (shouldAlert && targetId) {
                if (shouldIncrement) {
                    // Update unread count state and save
                    const current = unreadCounts[targetId]?.count ?? 0;
                    const next = {
                        ...unreadCounts,
                        [targetId]: {
                            count: current + 1,
                            serverId: serverId || null,
                        },
                    };
                    saveCounts(next);
                }

                // Play audio chime
                playNotificationSound();

                // Trigger desktop notification
                const senderName = message.member.profile.name;
                const messageText = message.content || "Sent an attachment";
                
                let title = type === "channel" 
                    ? `New message in #${senderName}` 
                    : `Message from ${senderName}`;

                if (isMentioned) {
                    title = `${senderName} mentioned you in #${senderName}`;
                }
                
                const clickUrl = type === "channel"
                    ? `/servers/${serverId}/channels/${channelId}`
                    : `/servers/${params?.serverId || "me"}/conversation/${message.member.id}`;

                showDesktopNotification(title, messageText, clickUrl);

                // Display an on-screen Toast notification
                toast(title, {
                    description: messageText.length > 60 ? `${messageText.slice(0, 60)}...` : messageText,
                    action: {
                        label: "Open",
                        onClick: () => {
                            window.location.href = clickUrl;
                        },
                    },
                });
            }
        };

        socket.on("message:new", handleNewMessage);

        return () => {
            socket.off("message:new", handleNewMessage);
        };
    }, [socket, unreadCounts, params?.channelId, params?.conversationId, params?.serverId]);

    return (
        <UnreadContext.Provider
            value={{
                unreadCounts,
                getUnreadCount,
                getServerUnreadCount,
                clearUnread,
            }}
        >
            {children}
        </UnreadContext.Provider>
    );
};
