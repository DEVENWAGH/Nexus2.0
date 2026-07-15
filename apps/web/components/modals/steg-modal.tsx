"use client";

import { useCallback, useEffect, useState } from "react";
import qs from "query-string";
import { KeyRound, Lock, Unlock, Send, ShieldCheck, Music, Video, FileText, Image as ImageIcon } from "lucide-react";
import { encodeSteg, decodeStegFromUrl, detectStegMediaType } from "@/lib/client-steg";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useModal } from "@/hooks/use-mode-store";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { uploadEncodedStegImage } from "@/lib/steg-utils";
import { uploadMessageFile } from "@/lib/steg-utils";

type StegFileType = "image" | "audio" | "video" | "pdf";

/** MIME types for each steganography file type */
const STEG_MIME: Record<StegFileType, string> = {
    image: "image/png",
    audio: "audio/mpeg",
    video: "video/mp4",
    pdf: "application/pdf",
};

/** File extensions for re-uploading encoded files */
const STEG_EXT: Record<StegFileType, string> = {
    image: "png",
    audio: "mp3",
    video: "mp4",
    pdf: "pdf",
};

/** Labels & icons for each file type. */
const FILE_TYPE_META: Record<StegFileType, { label: string; icon: React.ReactNode; technique: string }> = {
    image: {
        label: "Image",
        icon: <ImageIcon className="h-4 w-4" />,
        technique: "LSB pixel encoding",
    },
    audio: {
        label: "Audio",
        icon: <Music className="h-4 w-4" />,
        technique: "Append steganography",
    },
    video: {
        label: "Video",
        icon: <Video className="h-4 w-4" />,
        technique: "Append steganography",
    },
    pdf: {
        label: "PDF",
        icon: <FileText className="h-4 w-4" />,
        technique: "Post-EOF steganography",
    },
};

const StegModal = () => {
    const { isOpen, onClose, type, data } = useModal();
    const { userId } = useAuth();
    const isModalOpen = isOpen && type === "steganography";

    const [secretText, setSecretText] = useState("");
    const [decodePassword, setDecodePassword] = useState("");
    const [encodePassword, setEncodePassword] = useState("");
    const [passwordRequired, setPasswordRequired] = useState(false);
    const [encodedDataB64, setEncodedDataB64] = useState<string | null>(null);
    const [decodedText, setDecodedText] = useState<string | null>(null);
    const [isDecoding, setIsDecoding] = useState(false);
    const [isEncoding, setIsEncoding] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [mode, setMode] = useState<"encode" | "decode">("decode");

    // Support both legacy imageUrl and new stegFileType/fileUrl
    const fileType: StegFileType = data?.stegFileType ?? "image";
    const fileUrl = data?.fileUrl ?? data?.imageUrl;
    const meta = FILE_TYPE_META[fileType];

    const resetState = useCallback(() => {
        setSecretText("");
        setDecodePassword("");
        setEncodePassword("");
        setPasswordRequired(false);
        setEncodedDataB64(null);
        setDecodedText(null);
        setMode("decode");
    }, []);

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleDecode = useCallback(async () => {
        if (!fileUrl) return;
        setIsDecoding(true);
        setDecodedText(null);
        setPasswordRequired(false);
        try {
            const mimeType = STEG_MIME[fileType];
            const result = await decodeStegFromUrl(
                fileUrl,
                mimeType,
                decodePassword.trim() || undefined,
            );

            if (result.passwordRequired) {
                setPasswordRequired(true);
                return;
            }
            if (result.found && result.secretText) {
                setDecodedText(result.secretText);
            } else {
                setDecodedText("__none__");
            }
        } catch (e) {
            toast.error((e as Error).message || "Decode failed (client-side).");
        } finally {
            setIsDecoding(false);
        }
    }, [fileUrl, decodePassword, fileType]);

    // Auto-extract hidden message when opening in decode mode
    useEffect(() => {
        if (isModalOpen && fileUrl && mode === "decode" && !decodePassword) {
            handleDecode();
        }
    }, [isModalOpen, fileUrl, mode, decodePassword, handleDecode]);

    const handleEncode = async () => {
        if (!fileUrl || !secretText.trim()) {
            toast.error("Enter a secret message first.");
            return;
        }
        setIsEncoding(true);
        setEncodedDataB64(null);
        try {
            // Fetch the source file
            const resp = await fetch(fileUrl);
            if (!resp.ok) throw new Error(`Failed to fetch source file: ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            const mimeType = STEG_MIME[fileType];
            const sourceFile = new File([buffer], `source.${STEG_EXT[fileType]}`, { type: mimeType });

            // Encode client-side in Web Worker
            const encodedBlob = await encodeSteg(
                sourceFile,
                secretText.trim(),
                encodePassword.trim() || undefined,
            );

            // Convert blob â†’ base64 for the send handler
            const arrayBuf = await encodedBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binary = "";
            for (const b of bytes) binary += String.fromCharCode(b);
            setEncodedDataB64(btoa(binary));
            toast.success(`Secret hidden in ${meta.label.toLowerCase()}! Send it when ready.`);
        } catch (e: unknown) {
            toast.error((e as Error).message || "Encode failed (client-side).");
        } finally {
            setIsEncoding(false);
        }
    };

    const handleSendEncoded = async () => {
        if (!encodedDataB64 || !data?.apiUrl) {
            toast.error("No encoded data or API URL.");
            return;
        }
        setIsSending(true);
        try {
            const url = qs.stringifyUrl({
                url: data.apiUrl,
                query: data.query,
            });

            let uploadedUrl: string;

            if (fileType === "image") {
                // Image: upload as PNG via the existing steg image uploader
                uploadedUrl = await uploadEncodedStegImage(encodedDataB64);
            } else {
                // Audio/video/pdf: convert base64 to file and upload via UploadThing
                const mimeTypes: Record<string, string> = {
                    audio: "audio/mpeg",
                    video: "video/mp4",
                    pdf: "application/pdf",
                };
                const extensions: Record<string, string> = {
                    audio: "mp3",
                    video: "mp4",
                    pdf: "pdf",
                };
                const binary = atob(encodedDataB64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const file = new File(
                    [bytes],
                    `hidden_message.${extensions[fileType]}`,
                    { type: mimeTypes[fileType] }
                );
                uploadedUrl = await uploadMessageFile(file);
            }

            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ fileUrl: uploadedUrl, content: "" }),
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({})) as { error?: string };
                throw new Error(errData.error ?? `HTTP ${resp.status}`);
            }

            toast.success(`Steganography ${meta.label.toLowerCase()} sent!`);
            handleClose();
        } catch (e) {
            toast.error((e as Error).message || `Failed to send encoded ${meta.label.toLowerCase()}.`);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="bg-background text-foreground overflow-y-auto max-h-[90vh] max-w-md">
                <DialogHeader className="pt-6 px-6">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Lock className="h-5 w-5 text-indigo-500" />
                        Hidden Message â€” Steganography
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm">
                        Hide or reveal secret text inside this {meta.label.toLowerCase()} using {meta.technique.toLowerCase()}.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 pb-6 space-y-4">
                    {/* â”€â”€ File Preview â”€â”€ */}
                    {fileUrl && (
                        <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 relative bg-zinc-100 dark:bg-zinc-800">
                            {fileType === "image" ? (
                                <div className="relative h-40">
                                    <Image src={fileUrl} alt="Source" fill unoptimized className="object-contain" />
                                </div>
                            ) : fileType === "audio" ? (
                                <div className="p-4 flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                        <Music className="h-5 w-5 text-indigo-500" />
                                    </div>
                                    <audio controls className="flex-1 h-8 min-w-0">
                                        <source src={fileUrl} />
                                    </audio>
                                </div>
                            ) : fileType === "video" ? (
                                <div className="max-h-48">
                                    <video controls className="w-full rounded-md bg-black max-h-48" preload="metadata">
                                        <source src={fileUrl} />
                                    </video>
                                </div>
                            ) : (
                                <div className="p-4 flex items-center gap-3">
                                    <FileText className="h-10 w-10 text-red-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">PDF Document</p>
                                        <a
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-indigo-500 hover:underline"
                                        >
                                            Open in new tab
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* â”€â”€ File type badge â”€â”€ */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {meta.icon}
                        <span>{meta.label} Â· {meta.technique}</span>
                    </div>

                    {/* â”€â”€ Mode toggle â”€â”€ */}
                    <div className="flex rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                        <button
                            type="button"
                            onClick={() => {
                                setMode("decode");
                                setEncodedDataB64(null);
                                setDecodedText(null);
                                setPasswordRequired(false);
                            }}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors",
                                mode === "decode"
                                    ? "bg-indigo-500 text-white"
                                    : "bg-transparent text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                            )}
                        >
                            <Unlock className="h-4 w-4" /> Decode
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode("encode");
                                setDecodedText(null);
                                setEncodedDataB64(null);
                                setPasswordRequired(false);
                            }}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors",
                                mode === "encode"
                                    ? "bg-indigo-500 text-white"
                                    : "bg-transparent text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800",
                            )}
                        >
                            <Lock className="h-4 w-4" /> Encode
                        </button>
                    </div>

                    {/* â”€â”€ Decode mode â”€â”€ */}
                    {mode === "decode" && (
                        <div className="space-y-3">
                            {(passwordRequired || decodePassword) && (
                                <div className="space-y-2">
                                    <Label htmlFor="decode-password" className="text-xs flex items-center gap-1.5">
                                        <KeyRound className="h-3.5 w-3.5" />
                                        Password
                                    </Label>
                                    <Input
                                        id="decode-password"
                                        type="password"
                                        placeholder="Enter password to unlock hidden message"
                                        value={decodePassword}
                                        onChange={(e) => setDecodePassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                    {passwordRequired && (
                                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                            This {meta.label.toLowerCase()} contains a password-protected secret.
                                        </p>
                                    )}
                                </div>
                            )}

                            <Button
                                onClick={handleDecode}
                                disabled={isDecoding || !fileUrl || (passwordRequired && !decodePassword.trim())}
                                className="w-full gap-2"
                                variant="primary"
                            >
                                {isDecoding ? <Spinner /> : <Unlock className="h-4 w-4" />}
                                {isDecoding
                                    ? "Scanning for hidden data..."
                                    : passwordRequired
                                      ? "Unlock Hidden Message"
                                      : "Re-scan for Hidden Message"}
                            </Button>

                            {isDecoding && (
                                <p className="text-xs text-center text-muted-foreground">
                                    Scanning {meta.label.toLowerCase()} for hidden data...
                                </p>
                            )}

                            {!isDecoding && decodedText === "__none__" && (
                                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm text-muted-foreground text-center">
                                    No hidden message found in this {meta.label.toLowerCase()}.
                                </div>
                            )}

                            {!isDecoding && decodedText && decodedText !== "__none__" && (
                                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 space-y-1">
                                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Hidden message decoded:
                                    </p>
                                    <p className="text-sm text-zinc-800 dark:text-zinc-100 break-words font-medium">
                                        &ldquo;{decodedText}&rdquo;
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* â”€â”€ Encode mode â”€â”€ */}
                    {mode === "encode" && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                    Secret message to hide:
                                </label>
                                <Input
                                    value={secretText}
                                    onChange={(e) => setSecretText(e.target.value)}
                                    placeholder="Type your secret message..."
                                    maxLength={500}
                                    className="text-sm"
                                />
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    {secretText.length}/500 characters Â· Hidden in {meta.label.toLowerCase()} via {meta.technique.toLowerCase()}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="encode-password" className="text-xs flex items-center gap-1.5">
                                    <KeyRound className="h-3.5 w-3.5" />
                                    Password (optional)
                                </Label>
                                <Input
                                    id="encode-password"
                                    type="password"
                                    placeholder="Encrypt before hiding"
                                    value={encodePassword}
                                    onChange={(e) => setEncodePassword(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>

                            <Button
                                onClick={handleEncode}
                                disabled={isEncoding || !secretText.trim() || !fileUrl}
                                className="w-full gap-2"
                                variant="primary"
                            >
                                {isEncoding ? <Spinner /> : <Lock className="h-4 w-4" />}
                                {isEncoding ? "Encoding..." : `Hide Message in ${meta.label}`}
                            </Button>

                            {encodedDataB64 && (
                                <div className="space-y-2">
                                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            {meta.label} encoded! {fileType === "image" ? "Looks identical but contains your secret." : "File plays/opens normally but contains your secret."}
                                        </p>
                                    </div>

                                    {/* Show image preview for encoded images */}
                                    {fileType === "image" && (
                                        <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 relative h-32 bg-zinc-100 dark:bg-zinc-800">
                                            <Image
                                                src={`data:image/png;base64,${encodedDataB64}`}
                                                alt="Encoded"
                                                fill
                                                unoptimized
                                                className="object-contain"
                                            />
                                        </div>
                                    )}

                                    {data?.apiUrl ? (
                                        <Button
                                            onClick={handleSendEncoded}
                                            disabled={isSending}
                                            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                                        >
                                            {isSending ? <Spinner /> : <Send className="h-4 w-4" />}
                                            {isSending ? "Sending..." : `Send Encoded ${meta.label}`}
                                        </Button>
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground text-center">
                                            Open this from a chat message to send the encoded {meta.label.toLowerCase()}.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default StegModal;
