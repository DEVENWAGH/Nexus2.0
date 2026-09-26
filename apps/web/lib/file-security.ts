import {
    BLOCKED_EXECUTABLE_EXTENSIONS,
    BLOCKED_MIME_TYPES,
    isDangerousFilename,
    isDangerousMimeType,
    hasExecutableMagicBytes,
    validateBufferSecurity,
    type FileSecurityCheckResult,
} from "@repo/p2p";

export {
    BLOCKED_EXECUTABLE_EXTENSIONS,
    BLOCKED_MIME_TYPES,
    isDangerousFilename,
    isDangerousMimeType,
    hasExecutableMagicBytes,
    validateBufferSecurity,
    type FileSecurityCheckResult,
};

/**
 * Safe accept patterns for client <input type="file" /> elements.
 * Explicitly restricts users from picking executables or active script formats.
 */
export const SAFE_ACCEPT_CONFIG = {
    imageUploader: "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif",
    messageFile: "image/png,image/jpeg,image/webp,image/gif,image/bmp,audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/flac,audio/mp4,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,.png,.jpg,.jpeg,.webp,.gif,.bmp,.mp3,.wav,.ogg,.aac,.flac,.m4a,.mp4,.webm,.mov,.pdf,.txt",
    p2pTransfer: "image/png,image/jpeg,image/webp,image/gif,image/bmp,audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/flac,audio/mp4,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,.png,.jpg,.jpeg,.webp,.gif,.bmp,.mp3,.wav,.ogg,.aac,.flac,.m4a,.mp4,.webm,.mov,.pdf,.txt",
} as const;

/** Allowed extensions for image uploads (server icons, avatars) */
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

/** Allowed MIME types for image uploads */
const ALLOWED_IMAGE_MIMES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);

/**
 * Sanitizes a filename, stripping directory traversal characters and dangerous control codes.
 */
export function sanitizeFilename(filename: string): string {
    if (!filename) return "file";
    // Remove null bytes and path traversal separators
    let cleaned = filename.replace(/\0/g, "").replace(/[/\\?%*:|"<>]/g, "_");
    // Strip leading dots to prevent hidden files or traversal like ../
    cleaned = cleaned.replace(/^\.+/, "");
    // Truncate length
    if (cleaned.length > 200) {
        const ext = cleaned.split(".").pop() || "";
        const base = cleaned.slice(0, 190);
        cleaned = `${base}.${ext}`;
    }
    return cleaned || "file";
}

/**
 * Validates a File or Blob before upload or transfer.
 * Checks filename, MIME type, allowed endpoint rules, and magic bytes.
 */
export async function validateUploadedFile(
    file: File | Blob,
    endpoint: "imageUploader" | "messageFile" = "messageFile",
    declaredName?: string,
): Promise<FileSecurityCheckResult> {
    const filename = declaredName || (file instanceof File ? file.name : "") || "uploaded_file";

    // 1. Filename validation
    const nameCheck = isDangerousFilename(filename);
    if (!nameCheck.safe) {
        return nameCheck;
    }

    // 2. MIME type validation against blacklist
    const mimeType = file.type;
    const mimeCheck = isDangerousMimeType(mimeType);
    if (!mimeCheck.safe) {
        return mimeCheck;
    }

    // 3. Endpoint-specific allowlist check
    if (endpoint === "imageUploader") {
        const ext = filename.split(".").pop()?.toLowerCase();
        if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
            return {
                safe: false,
                reason: `Only safe image formats (PNG, JPG, JPEG, WEBP, GIF) are allowed for icons/avatars. (Detected: .${ext || "unknown"})`,
            };
        }

        if (mimeType && !ALLOWED_IMAGE_MIMES.has(mimeType.toLowerCase())) {
            return {
                safe: false,
                reason: `Invalid image MIME type: ${mimeType}. Please upload a standard PNG, JPG, WEBP, or GIF image.`,
            };
        }
    }

    // 4. Magic bytes inspection on initial file slice
    try {
        const slice = file.slice(0, 512);
        const buffer = await slice.arrayBuffer();
        const initialBytes = new Uint8Array(buffer);

        const magicCheck = hasExecutableMagicBytes(initialBytes);
        if (!magicCheck.safe) {
            return magicCheck;
        }

        // For imageUploader, verify image magic header
        if (endpoint === "imageUploader" && initialBytes.length >= 4) {
            const isPng =
                initialBytes[0] === 0x89 &&
                initialBytes[1] === 0x50 &&
                initialBytes[2] === 0x4e &&
                initialBytes[3] === 0x47;
            const isJpeg =
                initialBytes[0] === 0xff &&
                initialBytes[1] === 0xd8 &&
                initialBytes[2] === 0xff;
            const isGif =
                initialBytes[0] === 0x47 &&
                initialBytes[1] === 0x49 &&
                initialBytes[2] === 0x46 &&
                initialBytes[3] === 0x38;
            const isWebp =
                initialBytes.length >= 12 &&
                initialBytes[0] === 0x52 &&
                initialBytes[1] === 0x49 &&
                initialBytes[2] === 0x46 &&
                initialBytes[3] === 0x46 &&
                initialBytes[8] === 0x57 &&
                initialBytes[9] === 0x45 &&
                initialBytes[10] === 0x42 &&
                initialBytes[11] === 0x50;

            if (!isPng && !isJpeg && !isGif && !isWebp) {
                return {
                    safe: false,
                    reason: "File does not match valid image signature (PNG, JPEG, GIF, WEBP). Disguised or corrupted files are prohibited.",
                };
            }
        }
    } catch (err) {
        console.error("[validateUploadedFile] Error reading file buffer:", err);
    }

    return { safe: true };
}
