"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import { Form, FormControl, FormField, FormItem } from "../ui/form";
import { Plus, Send, Loader2, Timer, Flame, Bomb } from "lucide-react";
import qs from "query-string";
import axios from "axios";
import { useModal } from "@/hooks/use-mode-store";
import EmojiPicker from "../emoji-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { upsertChatMessage } from "@/lib/chat-cache";
import { useP2PChatContext } from "./p2p-chat-bridge";
import P2PFileTransfer from "./p2p-file-transfer";

import { encryptForChannel } from "@/lib/client-crypto";
import { getOrCreateIdentity } from "@/hooks/use-identity";
import { useBlockchain } from "@/hooks/use-blockchain";

interface ChatInputProps {
    apiUrl: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: Record<string, any>;
    name: string;
    type: "conversation" | "channel";
}

const formSchema = z.object({
    content: z.string().min(1),
});

const ChatInput = ({ apiUrl, query, name, type }: ChatInputProps) => {
    const { onOpen } = useModal();
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const { sendP2P, isReady } = useP2PChatContext();
    const [selfDestruct, setSelfDestruct] = useState<"none" | "10" | "30" | "60" | "300" | "3600" | "burn">("none");
    const [showDestructMenu, setShowDestructMenu] = useState(false);
    const { addTransaction } = useBlockchain();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            content: "",
        },
    });
    const isLoading = form.formState.isSubmitting;

    const onSubmit = async (value: z.infer<typeof formSchema>) => {
        try {
            const prefix = selfDestruct === "burn" ? "[BURN] " : selfDestruct !== "none" ? `[TTL:${selfDestruct}] ` : "";
            const plainText = `${prefix}${value.content}`;
            const chatId = query.channelId ?? query.conversationId ?? "";

            let finalContent = plainText;
            try {
                const identity = await getOrCreateIdentity();
                finalContent = await encryptForChannel(plainText, chatId, identity.privateKey);
            } catch (cryptoErr) {
                console.error("Client side encryption failed, sending plaintext as fallback", cryptoErr);
            }

            const interceptedValue = {
                ...value,
                content: finalContent
            };

            const url = qs.stringifyUrl({
                url: apiUrl,
                query,
            });
            const response = await axios.post(url, interceptedValue, {
                headers: {
                    ...(userId ? { "X-User-Id": userId } : {}),
                },
            });
            if (response?.data) {
                if (chatId) {
                    queryClient.setQueryData(
                        [`chat:${chatId}`],
                        (
                            oldData:
                                | InfiniteData<{ items: unknown[] }>
                                | undefined,
                        ) => upsertChatMessage(oldData, response.data),
                    );

                    // Add integrity proof hash to client-side blockchain
                    if (response.data.blockchainHash) {
                        try {
                            await addTransaction(
                                userId || "anonymous",
                                chatId,
                                JSON.stringify({
                                    msg_id: response.data.id,
                                    msg_hash: response.data.blockchainHash,
                                    timestamp: Date.now()
                                }),
                                "message-hash"
                            );
                        } catch (bcErr) {
                            console.error("Failed to log transaction to local blockchain:", bcErr);
                        }
                    }
                }
                if (isReady && value.content) {
                    void sendP2P(`${prefix}${value.content}`, response.data.id);
                }
                form.reset();
                setSelfDestruct("none");
            }
        } catch (err) {
            console.error(err);
        }
    };


    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full">
                <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                        <FormItem className="w-full">
                            <FormControl>
                                <div className="relative group w-full">
                                    <div className="relative flex items-center gap-x-3 bg-secondary p-2.5 rounded-lg border-none transition-all w-full">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onOpen("messageFile", {
                                                    apiUrl,
                                                    query,
                                                })
                                            }
                                            className="h-9 w-9 flex items-center justify-center rounded-full bg-zinc-200/50 dark:bg-zinc-700/50 hover:bg-primary-color hover:text-white dark:hover:bg-primary-color transition-all duration-300 text-zinc-500 dark:text-zinc-400 group/upload"
                                        >
                                            <Plus className="h-5 w-5 transition-transform group-hover/upload:rotate-90" />
                                        </button>
                                        {type === "conversation" && (
                                            <P2PFileTransfer
                                                apiUrl={apiUrl}
                                                query={query}
                                            />
                                        )}
                                        <input
                                            type="text"
                                            autoComplete="off"
                                            disabled={isLoading}
                                            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-[15px] px-1 text-foreground outline-none placeholder:text-muted-foreground"
                                            placeholder={`Message ${type === "conversation" ? name : "#" + name}`}
                                            {...field}
                                        />
                                        <div className="flex items-center gap-x-2 pr-1">
                                             <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDestructMenu(!showDestructMenu)}
                                                    className={cn(
                                                        "h-8 w-8 flex items-center justify-center rounded-full transition-all cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400",
                                                        selfDestruct === "burn" && "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 animate-pulse",
                                                        selfDestruct !== "none" && selfDestruct !== "burn" && "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20"
                                                    )}
                                                    title="Self-destruction settings"
                                                >
                                                    {selfDestruct === "burn" ? (
                                                        <Flame className="h-4 w-4" />
                                                    ) : (
                                                        <Timer className="h-4 w-4" />
                                                    )}
                                                </button>

                                                {showDestructMenu && (
                                                    <div className="absolute right-0 bottom-11 z-50 min-w-44 p-2 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg shadow-2xl flex flex-col gap-1">
                                                        <p className="text-[10px] text-zinc-500 font-bold px-2 py-1 uppercase tracking-wider">Self-Destruction</p>
                                                        {[
                                                            { label: "Off", value: "none" },
                                                            { label: "10 seconds", value: "10" },
                                                            { label: "30 seconds", value: "30" },
                                                            { label: "1 minute", value: "60" },
                                                            { label: "5 minutes", value: "300" },
                                                            { label: "1 hour", value: "3600" },
                                                            { label: "ðŸ”¥ Burn after read", value: "burn" }
                                                        ].map((opt) => (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelfDestruct(opt.value as any);
                                                                    setShowDestructMenu(false);
                                                                }}
                                                                className={cn(
                                                                    "w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-zinc-800/80 transition-colors flex items-center justify-between cursor-pointer",
                                                                    selfDestruct === opt.value && "text-indigo-400 font-semibold bg-indigo-500/10"
                                                                )}
                                                            >
                                                                <span>{opt.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {field.value?.trim() && (
                                                <button
                                                    type="submit"
                                                    disabled={isLoading}
                                                    className={cn(
                                                        "h-9 w-9 flex items-center justify-center rounded-full transition-all duration-300 bg-primary-color text-white shadow-lg shadow-primary-color/20 active:scale-90",
                                                    )}
                                                >
                                                    {isLoading ? (
                                                        <Loader2 className="h-5 w-5 animate-spin" />
                                                    ) : (
                                                        <Send className="h-4 w-4" />
                                                    )}
                                                </button>
                                            )}
                                            <EmojiPicker
                                                onChange={(emoji: string) =>
                                                    field.onChange(
                                                        `${field.value}${emoji}`,
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                            </FormControl>
                        </FormItem>
                    )}
                />
            </form>
        </Form>
    );
};

export default ChatInput;
