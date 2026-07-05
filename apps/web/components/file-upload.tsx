"use client";
import React from "react";
import { UploadButton } from "@/lib/uploadthing";
import "@uploadthing/react";
import { FileIcon, X, Upload as UploadIcon, FileText, Image as ImageIcon, Video, Music } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Spinner } from "./ui/spinner";
import { UPLOAD_FILE_SIZES, fileSizeLabelToBytes } from "@/lib/upload-limits";

const MESSAGE_FILE_LIMITS = {
    image: fileSizeLabelToBytes(UPLOAD_FILE_SIZES.messageImage),
    pdf: fileSizeLabelToBytes(UPLOAD_FILE_SIZES.messagePdf),
    video: fileSizeLabelToBytes(UPLOAD_FILE_SIZES.messageVideo),
    audio: fileSizeLabelToBytes(UPLOAD_FILE_SIZES.messageAudio),
} as const;

const IMAGE_UPLOADER_LIMIT = fileSizeLabelToBytes(UPLOAD_FILE_SIZES.serverIcon);

function getMessageFileSizeLimit(file: File): number {
    if (file.type.startsWith("image/")) return MESSAGE_FILE_LIMITS.image;
    if (file.type === "application/pdf") return MESSAGE_FILE_LIMITS.pdf;
    if (file.type.startsWith("video/")) return MESSAGE_FILE_LIMITS.video;
    if (file.type.startsWith("audio/")) return MESSAGE_FILE_LIMITS.audio;
    return MESSAGE_FILE_LIMITS.image;
}

function validateFileSize(file: File, endpoint: fileUploadProp["endpoint"]): string | null {
    const limit =
        endpoint === "imageUploader"
            ? IMAGE_UPLOADER_LIMIT
            : getMessageFileSizeLimit(file);
    if (file.size > limit) {
        const limitLabel =
            endpoint === "imageUploader"
                ? UPLOAD_FILE_SIZES.serverIcon
                : file.type.startsWith("image/")
                  ? UPLOAD_FILE_SIZES.messageImage
                  : file.type === "application/pdf"
                    ? UPLOAD_FILE_SIZES.messagePdf
                    : file.type.startsWith("video/")
                      ? UPLOAD_FILE_SIZES.messageVideo
                      : file.type.startsWith("audio/")
                        ? UPLOAD_FILE_SIZES.messageAudio
                        : UPLOAD_FILE_SIZES.messageImage;
        return `File is too large. Maximum size is ${limitLabel}.`;
    }
    return null;
}

interface fileUploadProp {
    onChange: (url?: string) => void;
    value: string;
    endpoint: "imageUploader" | "messageFile";
    onFileSelect?: (file: File | null) => void;
    /** Keep image files local until send — skips UploadThing on select (message attachments with steg). */
    deferUploadForImages?: boolean;
}

const FileUpload = ({ onChange, value, endpoint, onFileSelect, deferUploadForImages }: fileUploadProp) => {
    const fileType = value?.split(".").pop();
    const [imgError, setImgError] = React.useState(false);

    const getFileIcon = (url: string) => {
        const ext = url.split(".").pop()?.toLowerCase();
        if (["pdf"].includes(ext || "")) return <FileText className="h-12 w-12 text-destructive" />;
        if (["mp4", "webm", "mov"].includes(ext || "")) return <Video className="h-12 w-12 text-primary" />;
        if (["mp3", "wav", "aac"].includes(ext || "")) return <Music className="h-12 w-12 text-primary" />;
        return <FileIcon className="h-12 w-12 text-muted-foreground" />;
    };

    if (value) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative h-32 w-32 group">
                    {fileType !== "pdf" && !["mp4", "webm", "mov", "mp3", "wav", "aac"].includes(fileType || "") && !imgError ? (
                        <Image
                            fill
                            src={value}
                            alt="Upload"
                            unoptimized
                            className="rounded-full object-cover ring-4 ring-primary/10"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full w-full bg-secondary rounded-full ring-4 ring-primary/10">
                            {getFileIcon(value)}
                        </div>
                    )}

                    <button
                        onClick={() => {
                            if (value.startsWith("blob:")) {
                                URL.revokeObjectURL(value);
                            }
                            onFileSelect?.(null);
                            onChange("");
                        }}
                        className="absolute -top-2 -right-2 bg-destructive hover:bg-destructive/90 text-white p-2 rounded-full shadow-lg transition-all duration-200 opacity-0 group-hover:opacity-100"
                        type="button"
                        aria-label="Remove file"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Click the X to change file
                </p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary-color/50 bg-secondary/20 rounded-xl p-8 transition-all duration-200 hover:bg-secondary/40">
            <UploadIcon className="h-10 w-10 text-primary-color mb-4" />
            <p className="text-primary-color font-semibold text-base mb-2">
                Choose a file to upload
            </p>
            <p className="text-muted-foreground text-sm mb-4">
                {endpoint === "imageUploader"
                    ? `PNG, JPG, or GIF up to ${UPLOAD_FILE_SIZES.serverIcon}`
                    : `Image/PDF up to ${UPLOAD_FILE_SIZES.messageImage}/${UPLOAD_FILE_SIZES.messagePdf}, audio up to ${UPLOAD_FILE_SIZES.messageAudio}, video up to ${UPLOAD_FILE_SIZES.messageVideo}`}
            </p>

            <UploadButton
                endpoint={endpoint}
                onBeforeUploadBegin={(files) => {
                    const file = files[0];
                    if (!file) return files;

                    const sizeError = validateFileSize(file, endpoint);
                    if (sizeError) {
                        toast.error(sizeError);
                        return [];
                    }

                    onFileSelect?.(file);

                    if (deferUploadForImages && file.type.startsWith("image/")) {
                        onChange(URL.createObjectURL(file));
                        return [];
                    }

                    return files;
                }}
                onClientUploadComplete={(res) => {
                    const uploadedUrl = res?.[0]?.ufsUrl ?? res?.[0]?.url;
                    if (!uploadedUrl) {
                        toast.error("Upload finished but no file URL was returned.");
                        return;
                    }
                    onChange(uploadedUrl);
                    toast.success("Upload complete!");
                }}
                onUploadError={(err) => {
                    console.log(err);
                    const cause = err.cause as
                        | string
                        | Error
                        | { reason?: string; message?: string }
                        | undefined;
                    const reason =
                        typeof cause === "string"
                            ? cause
                            : cause &&
                                typeof cause === "object" &&
                                "reason" in cause &&
                                cause.reason
                              ? cause.reason
                              : cause instanceof Error
                                ? cause.message
                                : err.message;
                    toast.error(
                        /limit|mismatch|too large/i.test(reason)
                            ? reason
                            : "Upload failed. Please try again.",
                    );
                }}
                appearance={{
                    button: "bg-primary-color hover:bg-primary-color/90 text-white font-medium px-6 py-2.5 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ut-ready:bg-primary-color ut-uploading:cursor-not-allowed ut-uploading:bg-primary-color/50 ut-uploading:animate-pulse",
                    allowedContent: "hidden",
                }}
                content={{
                    button({ ready, isUploading }) {
                        if (isUploading) return <Spinner />;
                        if (ready) return "Choose File";
                        return "Getting ready...";
                    },
                }}
            />
        </div>
    );
};

export default FileUpload;
