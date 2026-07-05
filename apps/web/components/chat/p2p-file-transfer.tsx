"use client";

import { useEffect, useState, useRef } from "react";
import { useP2PChatContext } from "./p2p-chat-bridge";
import { FileIcon, Loader2, Share2, Download, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function P2PFileTransfer() {
    const { mesh, isReady, connectedPeers } = useP2PChatContext();
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
        const unsubscribeComplete = mesh.on("file-complete", (_, blob, name) => {
            setStatus("completed");
            setProgress(100);

            // Auto-trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

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

        setFile(selectedFile);
        setFileName(selectedFile.name);
        setFileSize(selectedFile.size);
        setStatus("sending");
        setProgress(0);

        try {
            await mesh.sendFile(selectedFile, (prog) => {
                setProgress(prog);
            });
            setStatus("completed");
            setTimeout(() => {
                setStatus("idle");
                setFile(null);
                setFileName("");
                setFileSize(0);
                setProgress(0);
            }, 3000);
        } catch (err) {
            console.error("Failed to send P2P file:", err);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 3000);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    if (!isReady || connectedPeers === 0) return null;

    return (
        <div className="flex items-center">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
            />
            <button
                type="button"
                onClick={triggerFileInput}
                disabled={status !== "idle"}
                className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-full transition-all cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 mr-1",
                    status !== "idle" && "bg-indigo-500/10 text-indigo-500 animate-pulse"
                )}
                title="Send file directly via P2P"
            >
                <Share2 className="h-4 w-4" />
            </button>

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
