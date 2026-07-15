"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import qs from "query-string";
import { Lock, Music, Video, FileText, Image as ImageIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from "@/components/ui/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import FileUpload from "../file-upload";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "../ui/spinner";
import { useModal } from "@/hooks/use-mode-store";
import { useAuth } from "@/hooks/use-auth";
import {
    extractBase64,
    prepareImageFileForSteg,
    uploadEncodedStegImage,
    uploadMessageFile,
} from "@/lib/steg-utils";
import { useQueryClient } from "@tanstack/react-query";
import { upsertChatMessage } from "@/lib/chat-cache";

type StegFileType = "image" | "audio" | "video" | "pdf" | null;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "aac", "flac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi"]);

const formSchema = z.object({
    fileUrl: z.string().min(1, { message: "Upload attachment first" }),
});

/** Detect what kind of steganography this attachment supports. */
function getAttachmentStegType(fileUrl: string, localFile: File | null): StegFileType {
    // Check via MIME type from the local file first
    if (localFile) {
        if (localFile.type.startsWith("image/")) return "image";
        if (localFile.type.startsWith("audio/")) return "audio";
        if (localFile.type.startsWith("video/")) return "video";
        if (localFile.type === "application/pdf") return "pdf";
    }

    // Check via data URI
    if (fileUrl.startsWith("data:image/")) return "image";
    if (fileUrl.startsWith("data:audio/")) return "audio";
    if (fileUrl.startsWith("data:video/")) return "video";
    if (fileUrl.startsWith("data:application/pdf")) return "pdf";

    // Check via file extension
    const ext = fileUrl.split("?")[0]?.split(".").pop()?.toLowerCase();
    if (ext) {
        if (IMAGE_EXTENSIONS.has(ext)) return "image";
        if (AUDIO_EXTENSIONS.has(ext)) return "audio";
        if (VIDEO_EXTENSIONS.has(ext)) return "video";
        if (ext === "pdf") return "pdf";
    }

    return null;
}

/** Labels for each steganography type. */
const STEG_TYPE_META: Record<Exclude<StegFileType, null>, { label: string; icon: React.ReactNode; technique: string }> = {
    image: { label: "image", icon: <ImageIcon className="w-4 h-4 shrink-0" />, technique: "LSB pixel encoding" },
    audio: { label: "audio", icon: <Music className="w-4 h-4 shrink-0" />, technique: "append steganography" },
    video: { label: "video", icon: <Video className="w-4 h-4 shrink-0" />, technique: "append steganography" },
    pdf: { label: "PDF", icon: <FileText className="w-4 h-4 shrink-0" />, technique: "post-EOF steganography" },
};

/** Encode endpoints for each type. */
const STEG_ENCODE_ENDPOINTS: Record<Exclude<StegFileType, null>, string> = {
    image: "/api/steganography/encode-base64",
    audio: "/api/steganography/encode-audio",
    video: "/api/steganography/encode-video",
    pdf: "/api/steganography/encode-pdf",
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
};

const urlToBase64 = async (url: string): Promise<string> => {
    if (url.startsWith("data:image/")) {
        return extractBase64(url);
    }
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error("Failed to fetch image for encoding");
    }
    const blob = await resp.blob();
    const dataUrl = await fileToBase64(new File([blob], "image", { type: blob.type }));
    return extractBase64(dataUrl);
};

/** Convert a file or blob URL to raw base64 for non-image types. */
const fileOrUrlToBase64 = async (fileUrl: string, localFile: File | null): Promise<string> => {
    if (localFile) {
        const dataUrl = await fileToBase64(localFile);
        return extractBase64(dataUrl);
    }
    if (fileUrl.startsWith("blob:")) {
        const resp = await fetch(fileUrl);
        const blob = await resp.blob();
        const dataUrl = await fileToBase64(new File([blob], "file", { type: blob.type }));
        return extractBase64(dataUrl);
    }
    // Remote URL â€” fetch and convert
    const resp = await fetch(fileUrl);
    if (!resp.ok) throw new Error("Failed to fetch file for encoding");
    const blob = await resp.blob();
    const dataUrl = await fileToBase64(new File([blob], "file", { type: blob.type }));
    return extractBase64(dataUrl);
};

const MessageFileModal = () => {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { isOpen, onClose, type, data } = useModal();
    const isModalOpen = isOpen && type === "messageFile";
    const { userId } = useAuth();

    const [localFile, setLocalFile] = useState<File | null>(null);
    const [secretMsg, setSecretMsg] = useState("");
    const [stegPassword, setStegPassword] = useState("");
    const [isEncoding, setIsEncoding] = useState(false);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            fileUrl: "",
        },
    });

    const fileUrl = form.watch("fileUrl");

    const stegType = useMemo(
        () => (fileUrl ? getAttachmentStegType(fileUrl, localFile) : null),
        [fileUrl, localFile],
    );

    const showStegFields = Boolean(fileUrl) && stegType !== null;
    const willEncode = showStegFields && Boolean(secretMsg.trim());
    const meta = stegType ? STEG_TYPE_META[stegType] : null;

    const handleClose = () => {
        const currentUrl = form.getValues("fileUrl");
        if (currentUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(currentUrl);
        }

        form.reset();
        setLocalFile(null);
        setSecretMsg("");
        setStegPassword("");
        setIsEncoding(false);
        onClose();
    };

    const loading = form.formState.isSubmitting || isEncoding;
    const { apiUrl, query } = data;

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        let response: any;
        if (willEncode) {
            if (!stegType) {
                toast.error("Cannot determine file type for steganography.");
                return;
            }
            if (!secretMsg.trim()) {
                toast.error("Enter a secret message to hide.");
                return;
            }
        }

        const loadingId = toast.loading(
            willEncode ? "Encoding secret & sending..." : "uploading attachment",
        );

        try {
            const url = qs.stringifyUrl({
                url: apiUrl || "",
                query,
            });

            if (willEncode && stegType) {
                setIsEncoding(true);

                if (stegType === "image") {
                    // â”€â”€ Image steganography (existing LSB flow) â”€â”€
                    const sourceFile = localFile ? await prepareImageFileForSteg(localFile) : null;
                    const rawDataUrl = sourceFile ? await fileToBase64(sourceFile) : null;
                    const imageB64 = rawDataUrl
                        ? extractBase64(rawDataUrl)
                        : await urlToBase64(values.fileUrl);

                    if (!imageB64) {
                        throw new Error("Could not read image data for encoding");
                    }

                    const res = await axios.post("/api/steganography/encode-base64", {
                        image_b64: imageB64,
                        secret_text: secretMsg.trim(),
                        ...(stegPassword.trim() ? { password: stegPassword.trim() } : {}),
                    });

                    const encodedB64 = res.data.encoded_image ?? res.data.encoded_b64;
                    if (!encodedB64) {
                        throw new Error("Encode response missing image data");
                    }

                    const uploadedUrl = await uploadEncodedStegImage(encodedB64);

                    response = await axios.post(
                        url,
                        { fileUrl: uploadedUrl, content: "" },
                    );
                } else {
                    // â”€â”€ Audio / Video / PDF steganography (append-based) â”€â”€
                    const fileB64 = await fileOrUrlToBase64(values.fileUrl, localFile);

                    if (!fileB64) {
                        throw new Error("Could not read file data for encoding");
                    }

                    const endpoint = STEG_ENCODE_ENDPOINTS[stegType];
                    const bodyFieldMap: Record<string, string> = {
                        audio: "audio_b64",
                        video: "video_b64",
                        pdf: "pdf_b64",
                    };

                    const res = await axios.post(endpoint, {
                        [bodyFieldMap[stegType] ?? "audio_b64"]: fileB64,
                        secret_text: secretMsg.trim(),
                        ...(stegPassword.trim() ? { password: stegPassword.trim() } : {}),
                    });

                    const encodedB64 = res.data.encoded_b64;
                    if (!encodedB64) {
                        throw new Error("Encode response missing file data");
                    }

                    // Convert base64 to File and upload via UploadThing
                    const mimeTypes: Record<string, string> = {
                        audio: localFile?.type || "audio/mpeg",
                        video: localFile?.type || "video/mp4",
                        pdf: "application/pdf",
                    };
                    const extensions: Record<string, string> = {
                        audio: "mp3",
                        video: "mp4",
                        pdf: "pdf",
                    };

                    const binary = atob(encodedB64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    const encodedFile = new File(
                        [bytes],
                        `hidden_message.${extensions[stegType]}`,
                        { type: mimeTypes[stegType] },
                    );

                    const uploadedUrl = await uploadMessageFile(encodedFile);

                    response = await axios.post(
                        url,
                        { fileUrl: uploadedUrl, content: "" },
                    );
                }
            } else {
                let fileUrlToSend = values.fileUrl;
                if (localFile && fileUrlToSend.startsWith("blob:")) {
                    fileUrlToSend = await uploadMessageFile(localFile);
                }

                response = await axios.post(
                    url,
                    { fileUrl: fileUrlToSend, content: "" },
                );
            }

            if (response?.data) {
                const chatId = (query?.channelId as string) || (query?.conversationId as string);
                if (chatId) {
                    queryClient.setQueryData(
                        [`chat:${chatId}`],
                        (oldData: any) => upsertChatMessage(oldData, response.data),
                    );
                }
            }

            if (values.fileUrl.startsWith("blob:")) {
                URL.revokeObjectURL(values.fileUrl);
            }

            form.reset();
            router.refresh();
            toast.success("attachment sent", { id: loadingId });
            handleClose();
        } catch (error) {
            const msg =
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                (error instanceof Error ? error.message : null);
            toast.error(msg || "Something went wrong. Please try again.", { id: loadingId });
        } finally {
            setIsEncoding(false);
        }
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="bg-background text-foreground p-0 overflow-hidden sm:max-w-md">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Add an attachment
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        Upload a file. You can optionally hide a secret message inside using steganography.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-4 px-6">
                            <div className="flex items-center justify-center text-center">
                                <FormField
                                    control={form.control}
                                    name="fileUrl"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <FileUpload
                                                    endpoint="messageFile"
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    onFileSelect={setLocalFile}
                                                    deferUploadForImages
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {showStegFields && meta && (
                                <div className="space-y-3 p-4 rounded-lg border bg-muted/20">
                                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                        <Lock className="w-4 h-4 shrink-0" />
                                        <span>Secret message (optional)</span>
                                    </div>

                                    {/* File type indicator */}
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        {meta.icon}
                                        <span>Detected: {meta.label} Â· Uses {meta.technique}</span>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="secret-message" className="text-xs text-muted-foreground">
                                            Leave empty to send the file as-is
                                        </Label>
                                        <textarea
                                            id="secret-message"
                                            placeholder={`Type a secret message to hide in this ${meta.label}...`}
                                            value={secretMsg}
                                            onChange={(e) => setSecretMsg(e.target.value)}
                                            maxLength={500}
                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none h-20"
                                        />
                                        <p className="text-[11px] text-muted-foreground">
                                            {secretMsg.length}/500 characters
                                        </p>
                                    </div>

                                    {secretMsg.trim() && (
                                        <div className="space-y-2">
                                            <Label htmlFor="steg-password" className="text-xs">
                                                Password (optional)
                                            </Label>
                                            <Input
                                                id="steg-password"
                                                type="password"
                                                placeholder="Extra encryption before hiding"
                                                value={stegPassword}
                                                onChange={(e) => setStegPassword(e.target.value)}
                                                autoComplete="new-password"
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                Recipients will need this password to read the hidden message.
                                            </p>
                                        </div>
                                    )}

                                    {secretMsg.trim() && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Message is encrypted (if password set) then hidden via {meta.technique}. The file will play/open normally.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="bg-muted/50 px-6 py-4">
                            <Button
                                disabled={loading || !fileUrl || (willEncode && !secretMsg.trim())}
                                variant="primary"
                            >
                                {loading ? <Spinner /> : willEncode ? "Hide & Send" : "Send"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
};

export default MessageFileModal;
