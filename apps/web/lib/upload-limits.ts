/** UploadThing maxFileSize strings — must use power-of-2 values (UploadThing v7). */
export const UPLOAD_FILE_SIZES = {
    serverIcon: "8MB",
    /** Steg encode outputs PNG, which is often much larger than a source JPEG. */
    messageImage: "32MB",
    messagePdf: "8MB",
    messageVideo: "64MB",
    messageAudio: "16MB",
} as const;

export type UploadFileSize = (typeof UPLOAD_FILE_SIZES)[keyof typeof UPLOAD_FILE_SIZES];

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function fileSizeLabelToBytes(size: string): number {
    const match = size.match(/^(\d+(?:\.\d+)?)([A-Z]+)$/i);
    if (!match?.[1] || !match[2]) {
        return 0;
    }
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const unitIndex = SIZE_UNITS.indexOf(unit as (typeof SIZE_UNITS)[number]);
    if (unitIndex < 0) {
        return 0;
    }
    return Math.floor(value * 1024 ** unitIndex);
}

export const MESSAGE_FILE_IMAGE_MAX_BYTES = fileSizeLabelToBytes(
    UPLOAD_FILE_SIZES.messageImage,
);

export function formatFileSize(bytes: number): string {
    if (bytes <= 0) return "0B";
    const unitIndex = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        SIZE_UNITS.length - 1,
    );
    const value = bytes / 1024 ** unitIndex;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}${SIZE_UNITS[unitIndex]}`;
}
