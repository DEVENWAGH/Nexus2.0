"use client";

import { useAuth } from "@/hooks/use-auth";
import axios from "axios";
import qs from "query-string";
import { useEffect, useState, useRef } from "react";
import { useP2PChatContext } from "./p2p-chat-bridge";
import { FileIcon, Loader2, Share2, Download, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    validateUploadedFile,
    isDangerousFilename,
    isDangerousMimeType,
    SAFE_ACCEPT_CONFIG,
} from "@/lib/file-security";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface P2PFileTransferProps {
    apiUrl?: string;
    query?: Record<string, any>;
}

export default function P2PFileTransfer({ apiUrl, query }: P2PFileTransferProps) {
    const { userId } = useAuth();
    const { mesh, isReady, connectedPeers, registerP2PFile } = useP2PChatContext();
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<"idle" | "sending" | "receiving" | "completed" | "error">("idle");
    const [fileName, setFileName] = useState("");
    const [fileSize, setFileSize] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!mesh) return;

        // Listen for incoming file metadata
        const unsubscribeMeta = mesh.on("file-metadata", (metadata) => {
            const nameCheck = isDangerousFilename(metadata.name);
            const mimeCheck = isDangerousMimeType(metadata.type);

            if (!nameCheck.safe || !mimeCheck.safe) {
                toast.error(`Security alert: Blocked unsafe incoming file "${metadata.name}" from peer.`);
                setStatus("error");
                setTimeout(() => setStatus("idle"), 3000);
                return;
            }

            setStatus("receiving");
            setFileName(metadata.name);
            setFileSize(metadata.size);
            setProgress(0);
        });

        // Listen for incoming file transfer progress
        const unsubscribeProgress = mesh.on("file-progress", (_, prog) => {
            setProgress(prog);
        });

        // Listen for incoming file transfer completion
        const unsubscribeComplete = mesh.on("file-complete", (fileId, blob, name) => {
            setStatus("completed");
            setProgress(100);

            // Register blob in local context registry instead of auto-downloading
            registerP2PFile(fileId, blob, name);

            setTimeout(() => {
                setStatus("idle");
                setFileName("");
                setFileSize(0);
                setProgress(0);
            }, 3000);
        });

        const unsubscribeError = mesh.on("error", (err) => {
            console.error("[P2PFileTransfer] error:", err);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 3000);
        });

        return () => {
            unsubscribeMeta();
            unsubscribeProgress();
            unsubscribeComplete();
            unsubscribeError();
        };
    }, [mesh]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile || !mesh) return;

        // Security check: reject executable, script, and auto-running files
        const securityCheck = await validateUploadedFile(selectedFile, "messageFile");
        if (!securityCheck.safe) {
            toast.error(securityCheck.reason || "Security restriction: Executable files and scripts cannot be shared.");
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            return;
        }

        setFile(selectedFile);
        setFileName(selectedFile.name);
        setFileSize(selectedFile.size);
        setStatus("sending");
        setProgress(0);

        const fileId = crypto.randomUUID();
        // Register the file locally for the sender
        registerP2PFile(fileId, selectedFile, selectedFile.name);

        try {
            await mesh.sendFile(selectedFile, fileId, (prog) => {
                setProgress(prog);
            });
            setStatus("completed");

            const sizeStr = (selectedFile.size / (1024 * 1024)).toFixed(2) + " MB";
            const fileMessageContent = `[P2P-FILE:${selectedFile.name}|${sizeStr}|${fileId}]`;

            if (apiUrl && query) {
                const url = qs.stringifyUrl({
                    url: apiUrl,
                    query,
                });
                const response = await axios.post(
                    url,
                    { content: fileMessageContent },
                    {
                        headers: {
                            ...(userId ? { "X-User-Id": userId } : {}),
                        },
                    }
                );
                
                if (response?.data?.id) {
                    void mesh.send(fileMessageContent, response.data.id);
                } else {
                    void mesh.send(fileMessageContent);
                }
            } else {
                void mesh.send(fileMessageContent);
            }

            setTimeout(() => {
                setStatus("idle");
                setFile(null);
                setFileName("");
                setFileSize(0);
                setProgress(0);
            }, 3000);
        } catch (err) {
            console.error("Failed to send P2P file:", err);
            toast.error(err instanceof Error ? err.message : "Failed to send P2P file");
            setStatus("error");
            setTimeout(() => setStatus("idle"), 3000);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    if (!isReady) return null;

    return (
        <div className="flex items-center">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept={SAFE_ACCEPT_CONFIG.p2pTransfer}
            />
            <TooltipProvider>
                <Tooltip delayDuration={150}>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={triggerFileInput}
                            disabled={status !== "idle" || connectedPeers === 0}
                            className={cn(
                                "h-8 w-8 flex items-center justify-center rounded-full transition-all mr-1",
                                status !== "idle" && "bg-indigo-500/10 text-indigo-500 animate-pulse cursor-pointer",
                                status === "idle" && connectedPeers > 0 && "cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400",
                                connectedPeers === 0 && "text-zinc-400/40 dark:text-zinc-500/30 cursor-not-allowed"
                            )}
                        >
                            <Share2 className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="max-w-xs bg-zinc-950 border border-zinc-800 text-zinc-200 p-3 rounded-lg shadow-xl">
                        {connectedPeers === 0 ? (
                            <div className="flex flex-col gap-1.5 text-left normal-case">
                                <p className="font-semibold text-amber-400 text-xs">P2P Sharing (Offline)</p>
                                <p className="text-[11px] leading-normal text-zinc-400">
                                    The recipient is not online in this DM. P2P transfers require <strong className="font-semibold text-zinc-300">both users to be on this screen at the same time</strong> to connect.
                                </p>
                                <p className="text-[10px] italic text-zinc-500 border-t border-zinc-800 pt-1 mt-0.5">
                                    Tip: For offline sharing, click the standard "+" upload button instead.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1 text-left normal-case">
                                <p className="font-semibold text-indigo-400 text-xs">P2P File Transfer (Ready)</p>
                                <p className="text-[11px] leading-normal text-zinc-400">
                                    Send files directly to the peer browser-to-browser. Files bypass the server completely (E2EE & unlimited size).
                                </p>
                            </div>
                        )}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {status !== "idle" && (
                <div className="fixed bottom-20 right-6 z-50 bg-zinc-950 border border-zinc-800 text-zinc-200 p-4 rounded-xl shadow-2xl w-80 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        {status === "sending" && <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />}
                        {status === "receiving" && <Download className="h-4 w-4 animate-bounce text-indigo-400" />}
                        {status === "completed" && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                        {status === "error" && <AlertCircle className="h-4 w-4 text-rose-400" />}
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            {status === "sending" && "Sending File via P2P"}
                            {status === "receiving" && "Receiving File via P2P"}
                            {status === "completed" && "Transfer Completed!"}
                            {status === "error" && "Transfer Failed"}
                        </span>
                    </div>

                    <div className="flex items-start gap-2.5 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                        <FileIcon className="h-8 w-8 fill-indigo-500/20 stroke-indigo-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-200 truncate">{fileName}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                                {(fileSize / (1024 * 1024)).toFixed(2)} MB
                            </p>
                        </div>
                    </div>

                    <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                        <div
                            className={cn(
                                "h-full transition-all duration-300",
                                status === "error" ? "bg-rose-500" : "bg-indigo-500"
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                        <span>{progress}%</span>
                        <span>Direct Peer Connection</span>
                    </div>
                </div>
            )}
        </div>
    );
}
