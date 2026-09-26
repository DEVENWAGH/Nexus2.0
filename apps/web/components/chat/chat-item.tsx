"use client";

import UserAvatar from "../user-avatar";
import { FileIcon, Trash, ShieldCheck, ShieldAlert, Lock, Download, Music, Video as VideoIcon, Loader2, Flame, Timer, Bomb, Share2, Check } from "lucide-react";
import ActionTooltip from "../action-tooltip";
import Image from "next/image";
import { MemberRole } from "@repo/db";
import { Member, Profile } from "@repo/db";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useModal } from "@/hooks/use-mode-store";
import { roleIconMap } from "@/constants/roleIconMap";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";
import { motion } from "motion/react";
import axios from "axios";
import { useP2PChatContext } from "./p2p-chat-bridge";
import { isClientEncrypted, decryptForChannel } from "@/lib/client-crypto";
import { getOrCreateIdentity } from "@/hooks/use-identity";
import { getClientBlockchain } from "@/lib/client-blockchain";
import { isDangerousFilename } from "@/lib/file-security";

// Dynamic import to avoid SSR issues — react-player uses browser APIs
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false }) as any;

interface ChatItemProps {
    id: string;
    content: string;
    chatId?: string;
    member?: (Member & {
        profile: Profile;
    }) | null;
    timestamp: string;
    rawTimestamp?: Date | string;
    fileUrl: string | null;
    deleted: boolean;
    currentMember?: Member | null;
    isUpdated?: boolean;
    socketUrl: string;
    socketQuery: Record<string, string>;
    blockchainHash?: string | null;
    /** UTC expiry time from the server — when the midnight cron will delete this message */
    expiresAt?: Date | string | null;
}


/** Formats milliseconds remaining into a human-readable countdown string */
function formatCountdown(ms: number): { label: string; urgency: "calm" | "amber" | "orange" | "red" } {
    if (ms <= 0) return { label: "Expiring now", urgency: "red" };
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h >= 2) return { label: `Expires in ${h}h ${m}m`, urgency: "calm" };
    if (h >= 1) return { label: `Expires in ${h}h ${m}m`, urgency: "amber" };
    if (m >= 5) return { label: `Expires in ${m}m`, urgency: "orange" };
    if (m >= 1) return { label: `Expires in ${m}m ${s}s`, urgency: "red" };
    return { label: `Expires in ${s}s`, urgency: "red" };
}

/** Hook: tracks time remaining until expiresAt, updates every second when < 2 hours */
function useExpiryCountdown(expiresAt?: Date | string | null) {
    const [msLeft, setMsLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!expiresAt) return;
        const expiry = new Date(expiresAt).getTime();

        const update = () => {
            const remaining = expiry - Date.now();
            setMsLeft(remaining);
        };

        update();
        // Only tick every second if < 2 hours left, else every minute
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const interval = setInterval(update, (expiry - Date.now()) < TWO_HOURS ? 1000 : 60_000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    return msLeft;
}

// Detect file type from URL
function getFileType(url: string): "image" | "video" | "audio" | "pdf" | "other" {
    if (url.startsWith("data:image/")) return "image";
    const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "";
    if (["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma"].includes(ext)) return "audio";
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
    // Fall back to content-type sniffing via URL patterns
    if (url.includes("video")) return "video";
    if (url.includes("audio")) return "audio";
    return "other"; // Default to other to prevent premature <Image> loading
}

/** Map our file types to the steganography file type for the modal. */
function toStegFileType(ft: "image" | "video" | "audio" | "pdf" | "other"): "image" | "audio" | "video" | "pdf" {
    if (ft === "other") return "image"; // fallback
    return ft;
}

function parseSelfDestruct(text: string) {
    if (text.startsWith("[TTL:")) {
        const match = text.match(/^\[TTL:(\d+)\]\s*(.*)/);
        if (match) {
            return {
                isSelfDestruct: true,
                type: "ttl" as const,
                duration: parseInt(match[1], 10),
                cleanContent: match[2],
            };
        }
    } else if (text.startsWith("[BURN]")) {
        const match = text.match(/^\[BURN\]\s*(.*)/);
        if (match) {
            return {
                isSelfDestruct: true,
                type: "burn" as const,
                duration: 5,
                cleanContent: match[1] || "Secure Message",
            };
        }
    }
    return {
        isSelfDestruct: false,
        type: null,
        duration: 0,
        cleanContent: text,
    };
}

const ChatItem = ({
    id,
    content,
    chatId = "",
    member,
    timestamp,
    rawTimestamp,
    fileUrl,
    deleted,
    currentMember,
    socketUrl,
    socketQuery,
    blockchainHash,
    expiresAt,
}: ChatItemProps) => {
    const msLeft = useExpiryCountdown(expiresAt);
    
    // Decrypted message content state
    const [decryptedContent, setDecryptedContent] = useState(content);

    // Asynchronously decrypt the message if it is encrypted
    useEffect(() => {
        let isMounted = true;
        const decrypt = async () => {
            try {
                if (content && isClientEncrypted(content)) {
                    const identity = await getOrCreateIdentity();
                    const decrypted = await decryptForChannel(content, chatId, identity.privateKey);
                    if (isMounted) {
                        setDecryptedContent(decrypted);
                    }
                } else {
                    if (isMounted) {
                        setDecryptedContent(content);
                    }
                }
            } catch (err) {
                console.error("Failed to decrypt message in chat-item:", err);
            }
        };
        decrypt();
        return () => {
            isMounted = false;
        };
    }, [content, chatId]);

    const parsed = useMemo(() => parseSelfDestruct(decryptedContent), [decryptedContent]);
    const { p2pFiles } = useP2PChatContext();

    const isP2PFile = !fileUrl && !deleted && decryptedContent.startsWith("[P2P-FILE:");
    let p2pFileName = "";
    let p2pFileSize = "";
    let p2pFileId = "";
    if (isP2PFile) {
        const parts = decryptedContent.slice(10, -1).split("|");
        p2pFileName = parts[0] || "";
        p2pFileSize = parts[1] || "";
        p2pFileId = parts[2] || "";
    }

    const isP2PDangerous = useMemo(() => {
        if (!isP2PFile || !p2pFileName) return false;
        return !isDangerousFilename(p2pFileName).safe;
    }, [isP2PFile, p2pFileName]);

    const isUrlDangerous = useMemo(() => {
        if (!fileUrl) return false;
        return !isDangerousFilename(fileUrl).safe;
    }, [fileUrl]);

    const handleP2PDownload = () => {
        const fileData = p2pFiles[p2pFileId];
        if (!fileData) return;

        const securityCheck = isDangerousFilename(fileData.name);
        if (!securityCheck.safe) {
            toast.error(securityCheck.reason || "Download blocked: Executable and script files cannot be downloaded.");
            return;
        }

        const url = URL.createObjectURL(fileData.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileData.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const [secondsLeft, setSecondsLeft] = useState(parsed.duration);
    const [isRevealed, setIsRevealed] = useState(false);
    const [isExpiring, setIsExpiring] = useState(false);
    const [isDeletedLocally, setIsDeletedLocally] = useState(false);

    // Sync seconds left when parsed.duration updates
    useEffect(() => {
        setSecondsLeft(parsed.duration);
    }, [parsed.duration]);

    useEffect(() => {
        if (!parsed.isSelfDestruct || parsed.type !== "ttl" || deleted || isDeletedLocally || !rawTimestamp) return;

        const createdAtTime = new Date(rawTimestamp).getTime();
        const expiryTime = createdAtTime + parsed.duration * 1000;

        const checkExpiry = () => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((expiryTime - now) / 1000));
            setSecondsLeft(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                setIsExpiring(true);
                setTimeout(() => {
                    setIsDeletedLocally(true);
                    void axios.delete(`${socketUrl}/${id}`, { params: socketQuery }).catch(() => {});
                }, 1000);
            }
        };

        const interval = setInterval(checkExpiry, 1000);
        checkExpiry(); // initial run

        return () => clearInterval(interval);
    }, [id, parsed, rawTimestamp, deleted, isDeletedLocally, socketUrl, socketQuery]);

    useEffect(() => {
        if (!parsed.isSelfDestruct || parsed.type !== "burn" || !isRevealed || deleted || isDeletedLocally) return;

        // Immediately delete from backend when revealed
        void axios.delete(`${socketUrl}/${id}`, { params: socketQuery }).catch(() => {});

        const interval = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setIsExpiring(true);
                    setTimeout(() => {
                        setIsDeletedLocally(true);
                    }, 1000);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [id, parsed, isRevealed, deleted, isDeletedLocally, socketUrl, socketQuery]);

    const [hasError, setHasError] = useState(false);
    const [showHashTooltip, setShowHashTooltip] = useState(false);
    const [verificationData, setVerificationData] = useState<{
        loading: boolean;
        verified: boolean;
        blockIndex?: number;
        timestamp?: string;
        blockHash?: string;
    } | null>(null);

    useEffect(() => {
        if (!showHashTooltip || !blockchainHash) return;

        setVerificationData({ loading: true, verified: false });

        getClientBlockchain()
            .then(async (bc) => {
                const res = await bc.verifyMessage(blockchainHash);
                if (res) {
                    setVerificationData({
                        loading: false,
                        verified: res.verified,
                        blockIndex: res.blockIndex,
                        timestamp: res.timestamp,
                        blockHash: res.blockHash,
                    });
                } else {
                    setVerificationData({ loading: false, verified: false });
                }
            })
            .catch((err) => {
                console.error("Local blockchain verification failed:", err);
                setVerificationData({ loading: false, verified: false });
            });
    }, [showHashTooltip, blockchainHash]);


    const params = useParams();
    const router = useRouter();

    const { onOpen } = useModal();

    function onMemberClick() {
        if (!member?.id || !currentMember?.id) {
            return;
        }
        if (member.id === currentMember.id) {
            return;
        }
        router.push(`/servers/${params?.serverId}/conversation/${member.id}`);
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setShowHashTooltip(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const [fileType, setFileType] = useState<"image" | "video" | "audio" | "pdf" | "other" | null>(
        fileUrl ? getFileType(fileUrl) : null
    );
    const [isLoadingType, setIsLoadingType] = useState(false);

    // Resolve file type dynamically if URL doesn't have a clear extension
    useEffect(() => {
        if (!fileUrl) return;
        const ext = fileUrl.split(".").pop()?.toLowerCase().split("?")[0];
        const hasClearExt = ext && ["mp4", "webm", "mov", "mp3", "wav", "ogg", "pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ext);

        if (!hasClearExt) {
            setIsLoadingType(true);
            fetch(fileUrl, { method: 'HEAD' })
                .then(res => {
                    const contentType = res.headers.get("content-type") || "";
                    if (contentType.startsWith("video/")) setFileType("video");
                    else if (contentType.startsWith("audio/")) setFileType("audio");
                    else if (contentType === "application/pdf") setFileType("pdf");
                    else if (contentType.startsWith("image/")) setFileType("image");
                })
                .catch(err => console.error("Failed to fetch file type:", err))
                .finally(() => setIsLoadingType(false));
        }
    }, [fileUrl]);

    const isAdmin = currentMember?.role === MemberRole.ADMIN;
    const isModerator = currentMember?.role === MemberRole.MODERATOR;
    const isOwner = currentMember?.id && member?.id ? currentMember.id === member.id : false;
    const canDeleteMessage = !deleted && (isAdmin || isModerator || isOwner);
    const isPDF = fileType === "pdf" && fileUrl;
    const isImage = fileType === "image" && fileUrl;
    const isVideo = fileType === "video" && fileUrl;
    const isAudio = fileType === "audio" && fileUrl;

    /** Opens the steganography modal for any file type. */
    function openStegModal() {
        if (!fileUrl || !fileType) return;
        onOpen("steganography", {
            imageUrl: fileType === "image" ? fileUrl : undefined,
            fileUrl: fileUrl,
            stegFileType: toStegFileType(fileType),
            apiUrl: socketUrl,
            query: socketQuery,
        });
    }

    /** Steganography button — reusable across all file types. */
    const StegButton = () => (
        <button
            onClick={openStegModal}
            className="flex items-center gap-1 mt-1.5 text-[11px] px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition-colors"
            title="Hidden message steganography"
        >
            <Lock className="h-3 w-3" />
            Hidden msg?
        </button>
    );

    if (isDeletedLocally) return null;

    const destroyVariants: import("motion/react").Variants = {
        visible: { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 },
        expiring: {
            opacity: 0,
            filter: "blur(12px)",
            scale: 0.85,
            y: -15,
            transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
        }
    };

    return (
        <motion.div
            variants={destroyVariants}
            initial="visible"
            animate={isExpiring ? "expiring" : "visible"}
            className="relative group flex items-center p-4 transition w-full hover:bg-black/5 dark:hover:bg-zinc-900/50 min-w-0"
        >
            <div className="group flex gap-x-2 items-start w-full min-w-0">
                <div
                    onClick={onMemberClick}
                    className="cursor-pointer hover:drop-shadow-md transition"
                >
                    <UserAvatar src={member?.profile?.imageUrl} />
                </div>
                <div className="flex flex-col w-full min-w-0">
                    <div className="flex items-center gap-x-2">
                        <div className="flex items-center">
                            <p
                                onClick={onMemberClick}
                                className="font-semibold text-sm hover:underline cursor-pointer"
                            >
                                {member?.profile?.name || "Unknown User"}
                            </p>
                            {member?.role && roleIconMap[member.role] && (
                                <ActionTooltip label={member.role}>
                                    {roleIconMap[member.role]}
                                </ActionTooltip>
                            )}
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {timestamp}
                        </span>

                        {/* ── 24h Expiry Countdown Badge ── */}
                        {!deleted && msLeft !== null && msLeft > 0 && msLeft < 2 * 60 * 60 * 1000 && (() => {
                            const { label, urgency } = formatCountdown(msLeft);
                            const colorMap = {
                                calm: "",
                                amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
                                orange: "text-orange-500 bg-orange-500/10 border-orange-500/20",
                                red: "text-rose-500 bg-rose-500/10 border-rose-500/20 animate-pulse",
                            } as const;
                            return (
                                <span
                                    title="This message will be automatically deleted by the nightly cleanup"
                                    className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${colorMap[urgency]}`}
                                >
                                    <Timer className="h-2.5 w-2.5" />
                                    {label}
                                </span>
                            );
                        })()}

                        {/* ── Blockchain Hash Badge ── */}
                        {blockchainHash && (
                            <div className="relative">
                                <ActionTooltip
                                    label={`Blockchain verified · Hash: ${blockchainHash.slice(0, 16)}...`}
                                >
                                    <button
                                        onClick={() => setShowHashTooltip((v) => !v)}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                        title="Blockchain verified"
                                    >
                                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono hidden sm:block">
                                            {blockchainHash.slice(0, 8)}…
                                        </span>
                                    </button>
                                </ActionTooltip>
                                {showHashTooltip && (
                                    <div className="absolute left-0 top-7 z-50 bg-zinc-950 text-zinc-100 text-xs rounded-lg shadow-xl p-3 w-72 border border-zinc-800 flex flex-col gap-2">
                                        <p className="font-semibold text-emerald-400 flex items-center gap-1">
                                            <ShieldCheck className="h-3.5 w-3.5 animate-pulse" />
                                            Blockchain Audit Verification
                                        </p>
                                        
                                        {verificationData?.loading ? (
                                            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                                                <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                                                <span>Auditing node blocks...</span>
                                            </div>
                                        ) : verificationData?.verified ? (
                                            <div className="flex flex-col gap-1.5 font-mono text-[10px] text-zinc-300">
                                                <div className="text-emerald-500 font-semibold uppercase text-[9px] tracking-wider">Status: Secure & Verified</div>
                                                <div className="flex justify-between border-b border-zinc-900 pb-0.5"><span className="text-zinc-500">Block Index:</span> <span className="text-zinc-200">#{verificationData.blockIndex}</span></div>
                                                <div className="flex flex-col gap-0.5"><span className="text-zinc-500">Block Hash:</span> <span className="text-amber-300 break-all select-all bg-zinc-900/50 p-1 rounded leading-normal text-[9px]">{verificationData.blockHash}</span></div>
                                                <div className="flex justify-between"><span className="text-zinc-500">Timestamp:</span> <span className="text-zinc-200">{new Date(verificationData.timestamp!).toLocaleTimeString()}</span></div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1 text-[10px] text-rose-400">
                                                <div className="font-bold uppercase text-[9px] tracking-wider text-rose-500">Warning: Unconfirmed / Modified</div>
                                                <p className="text-[9px] leading-normal text-zinc-400">This hash is unmined or modified. Run mining consensus or check system integration integrity.</p>
                                            </div>
                                        )}

                                        <div className="border-t border-zinc-800 pt-1.5 mt-0.5">
                                            <p className="text-zinc-500 text-[10px]">Message SHA-256 Hash:</p>
                                            <code className="block break-all text-[9px] text-zinc-400 bg-zinc-900/80 p-1 rounded font-mono select-all">
                                                {blockchainHash}
                                            </code>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Image ── */}
                    {isImage && !hasError && !deleted && (
                        <div className="relative mt-2">
                            <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative aspect-square rounded-md overflow-hidden border flex items-center bg-secondary h-48 w-48 block"
                            >
                                <Image
                                    src={fileUrl}
                                    alt={content}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                    onError={() => setHasError(true)}
                                />
                            </a>
                            <StegButton />
                        </div>
                    )}

                    {/* ── Video (react-player) ── */}
                    {isVideo && !deleted && (
                        <div className="mt-2 max-w-sm">
                            <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-md">
                                <div className="relative aspect-video bg-black">
                                    {/* @ts-ignore - Typescript issue with react-player dynamic import */}
                                    <ReactPlayer
                                        url={fileUrl}
                                        controls
                                        width="100%"
                                        height="100%"
                                        pip
                                        stopOnUnmount
                                        config={{
                                            file: {
                                                attributes: {
                                                    crossOrigin: "anonymous",
                                                    controlsList: "nodownload",
                                                },
                                            },
                                        } as any}
                                    />
                                </div>
                                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900/80 border-t border-zinc-200 dark:border-zinc-700/50">
                                    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 text-[11px]">
                                        <VideoIcon className="h-3 w-3" />
                                        <span>Video</span>
                                    </div>
                                    <a
                                        href={fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                    >
                                        <Download className="h-3 w-3" />
                                        Download
                                    </a>
                                </div>
                            </div>
                            <StegButton />
                        </div>
                    )}

                    {/* ── Audio (react-h5-audio-player) ── */}
                    {isAudio && !deleted && (
                        <div className="mt-2 max-w-xs w-full">
                            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm bg-zinc-50 dark:bg-zinc-800">
                                <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1">
                                    <div className="h-9 w-9 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                                        <Music className="h-4 w-4 text-indigo-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">Audio</p>
                                        <a
                                            href={fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download
                                            className="text-[10px] text-indigo-500 hover:text-indigo-400 flex items-center gap-0.5 transition-colors"
                                        >
                                            <Download className="h-2.5 w-2.5" />
                                            Download
                                        </a>
                                    </div>
                                </div>
                                <AudioPlayer
                                    src={fileUrl}
                                    showJumpControls={false}
                                    showDownloadProgress
                                    layout="horizontal-reverse"
                                    customAdditionalControls={[]}
                                    customVolumeControls={[]}
                                    autoPlayAfterSrcChange={false}
                                    className="nexus-audio-player"
                                />
                            </div>
                            <StegButton />
                        </div>
                    )}

                    {/* ── Loading State ── */}
                    {isLoadingType && !deleted && (
                        <div className="mt-2 flex items-center gap-2 p-3 rounded-md bg-zinc-100 dark:bg-zinc-800 border text-sm text-zinc-500 dark:text-zinc-400">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                            Loading attachment...
                        </div>
                    )}

                    {/* ── PDF / unknown file fallback ── */}
                    {!isLoadingType && (isPDF || fileType === "other" || (isImage && hasError)) && !deleted && (
                        <div className="mt-2">
                            {isUrlDangerous ? (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                                    <ShieldAlert className="h-5 w-5 shrink-0 text-rose-500" />
                                    <span>Blocked File: Executable, script, and auto-run files are restricted for platform security.</span>
                                </div>
                            ) : (
                                <>
                                    <div className="relative flex items-center p-2 rounded-md bg-zinc-100 dark:bg-zinc-800 border">
                                        <FileIcon className="h-10 w-10 fill-indigo-200 stroke-indigo-400" />
                                        <a
                                            href={fileUrl || ""}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-2 text-sm text-indigo-500 dark:text-indigo-400 hover:underline"
                                        >
                                            {isPDF ? `PDF File` : `Open File`}
                                        </a>
                                    </div>
                                    {(isPDF || fileType === "other") && <StegButton />}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Text content (also shown for deleted file messages) ── */}
                    {(!fileUrl || deleted) && (
                        deleted ? (
                            <p className="text-sm italic text-zinc-500 dark:text-zinc-400 mt-1">
                                {content}
                            </p>
                        ) : parsed.isSelfDestruct ? (
                            parsed.type === "ttl" ? (
                                <div className="flex flex-col gap-1 w-full">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere] whitespace-pre-wrap min-w-0 w-full">
                                        {parsed.cleanContent}
                                    </p>
                                    <div className="flex items-center gap-1 text-[10px] text-amber-500 font-semibold mt-1">
                                        <Timer className="h-3 w-3 animate-pulse" />
                                        <span>Self-destructs in {secondsLeft}s</span>
                                    </div>
                                </div>
                            ) : !isRevealed ? (
                                <button
                                    onClick={() => {
                                        setIsRevealed(true);
                                        setSecondsLeft(5);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-xs font-semibold cursor-pointer transition-all duration-300 active:scale-95 shadow-sm"
                                >
                                    <Flame className="h-4 w-4 animate-bounce" />
                                    <span>Reveal secure self-destructing message</span>
                                </button>
                            ) : (
                                <div className="flex flex-col gap-1 w-full animate-fade-in">
                                    <p className="text-sm text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere] whitespace-pre-wrap min-w-0 w-full">
                                        {parsed.cleanContent}
                                    </p>
                                    <div className="flex items-center gap-1 text-[10px] text-rose-500 font-semibold mt-1">
                                        <Bomb className="h-3.5 w-3.5 animate-pulse" />
                                        <span>Destroying in {secondsLeft}s</span>
                                    </div>
                                </div>
                            )
                        ) : isP2PFile ? (
                            isP2PDangerous ? (
                                <div className="mt-1.5 max-w-xs sm:max-w-md w-full p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-3">
                                    <ShieldAlert className="h-6 w-6 shrink-0 text-rose-500" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold truncate" title={p2pFileName}>{p2pFileName}</p>
                                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                                            Blocked Executable / Script: This file type is restricted to prevent auto-run and malicious code execution.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-1.5 max-w-xs sm:max-w-md w-full">
                                    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 shadow-sm relative overflow-hidden group/p2p hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 transition-all duration-300">
                                        <div className="h-10 w-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0 transition-transform group-hover/p2p:scale-105">
                                            <Share2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={p2pFileName}>
                                                {p2pFileName}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono font-medium">
                                                    {p2pFileSize}
                                                </span>
                                                <span className="h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-600 hidden xs:inline-block"></span>
                                                {p2pFiles[p2pFileId] ? (
                                                    <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5">
                                                        <Check className="h-3 w-3" /> Direct P2P Transfer Complete
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                                                        Direct P2P File Shared
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {p2pFiles[p2pFileId] ? (
                                            <button
                                                onClick={handleP2PDownload}
                                                className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-[11px] font-bold flex items-center gap-1 transition-all duration-300 active:scale-95 shadow-sm"
                                            >
                                                <Download className="h-3.5 w-3.5" />
                                                Download
                                            </button>
                                        ) : (
                                            <div className="text-[10px] px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 font-medium cursor-not-allowed" title="File only exists in-memory during active session. If sender disconnected or you refreshed, it is no longer available.">
                                                Unavailable
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        ) : (
                            <p className="text-sm text-zinc-600 dark:text-zinc-300 [overflow-wrap:anywhere] whitespace-pre-wrap min-w-0 w-full">
                                {decryptedContent}
                            </p>
                        )

                    )}
                </div>
            </div>
            {canDeleteMessage && (
                <div className="hidden group-hover:flex items-center gap-x-2 absolute p-1 -top-2 right-5 bg-white dark:bg-zinc-800 border rounded-sm shadow-sm transition">
                    <ActionTooltip label="Delete">
                        <Trash
                            onClick={() =>
                                onOpen("deleteMessage", {
                                    apiUrl: `${socketUrl}/${id}`,
                                    query: socketQuery,
                                })
                            }
                            className="cursor-pointer ml-auto w-4 h-4 text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
                        />
                    </ActionTooltip>
                </div>
            )}
        </motion.div>
    );
};

export default ChatItem;
