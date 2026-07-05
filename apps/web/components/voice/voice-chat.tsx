"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { useUser } from "@clerk/nextjs";
import { Send, Smile } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface VoiceChatProps {
    chatId: string;
}

interface ChatMessage {
    id: string;
    content: string;
    createdAt: string;
    member: {
        profile: {
            name: string;
            imageUrl: string;
        };
    };
}

export function VoiceChat({ chatId }: VoiceChatProps) {
    const { user } = useUser();
    const [draft, setDraft] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const queryKey = [`voice-chat:${chatId}`];

    const { data } = useQuery({
        queryKey,
        queryFn: async () => {
            const res = await axios.get(`/api/messages?channelId=${chatId}`);
            return (res.data.items as ChatMessage[]).reverse();
        },
        refetchInterval: 2000,
        staleTime: 0,
    });

    const messages = data ?? [];

    const sendMutation = useMutation({
        mutationFn: async (content: string) => {
            await axios.post("/api/messages", { channelId: chatId, content });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
            setDraft("");
        },
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const handleSend = () => {
        const trimmed = draft.trim();
        if (!trimmed || sendMutation.isPending) return;
        sendMutation.mutate(trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-background">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-thin">
                {messages.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-full gap-2 py-8"
                    >
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <Smile className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                            No messages yet. Say hello!
                        </p>
                    </motion.div>
                )}

                <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                        const isOwn = msg.member?.profile?.name === (user?.fullName ?? user?.username);
                        return (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                className="flex gap-3 hover:bg-black/5 py-1 px-1 rounded-sm group transition-colors"
                            >
                                {/* Avatar */}
                                <div className="shrink-0 pt-0.5">
                                    <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80">
                                        <img src={msg.member?.profile?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${msg.member?.profile?.name}`} alt="" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                                {/* Content */}
                                <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[15px] font-medium hover:underline cursor-pointer text-foreground">
                                            {msg.member?.profile?.name ?? "Unknown"}
                                        </span>
                                        <span className="text-xs text-muted-foreground font-medium">
                                            {format(new Date(msg.createdAt), "MM/dd/yyyy h:mm a")}
                                        </span>
                                    </div>
                                    <div className="text-[15px] text-foreground/90 break-words leading-relaxed">
                                        {msg.content}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-3 pb-4 bg-background mt-auto">
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-4 py-2.5 transition-colors">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-zinc-400 dark:bg-zinc-500 flex items-center justify-center cursor-pointer hover:bg-zinc-500 dark:hover:bg-zinc-400 transition-colors">
                        <span className="text-white text-xl leading-none mb-[2px]">+</span>
                    </div>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Message..."
                        rows={1}
                        className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[22px] max-h-[144px] overflow-y-auto scrollbar-none self-center mx-2"
                        style={{ scrollbarWidth: "none" }}
                    />
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleSend}
                        disabled={!draft.trim() || sendMutation.isPending}
                        className="shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="Send message"
                    >
                        <Smile className="w-6 h-6" />
                    </motion.button>
                </div>
            </div>
        </div>
    );
}
