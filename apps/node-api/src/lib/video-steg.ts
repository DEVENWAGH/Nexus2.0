/**
 * Append-based steganography for video files (MP4, WebM, MOV, AVI).
 *
 * Strategy: append an encrypted / plain-text payload after a unique magic
 * delimiter at the end of the video binary. Video decoders ignore trailing
 * bytes, so the file plays normally while carrying a hidden message.
 *
 * Uses the same AES-256-GCM + scrypt encryption as image steganography.
 */

import { encryptSecretText, decryptSecretText, isPasswordProtectedPayload } from "./steganography";

/** 16-byte magic marker — chosen to be extremely unlikely in real video data. */
const VIDEO_STEG_MAGIC = Buffer.from("NEXUS_VIDEO_STEG", "ascii");

/**
 * Encode a secret message into a video buffer by appending it after a
 * delimiter. The original video bytes are left completely untouched.
 */
export function encodeVideo(
    videoBuffer: Buffer,
    secretText: string,
    password?: string,
): Buffer {
    if (!secretText.trim()) {
        throw new Error("secret_text is required");
    }

    const payload = encryptSecretText(secretText.trim(), password);
    const payloadBuf = Buffer.from(payload, "utf-8");

    // Layout: [original video] [MAGIC] [4-byte payload length BE] [payload]
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(payloadBuf.length, 0);

    return Buffer.concat([videoBuffer, VIDEO_STEG_MAGIC, lengthBuf, payloadBuf]);
}

/**
 * Decode a hidden message from a video buffer.
 * Returns the raw payload string (may be password-protected).
 */
export function decodeVideo(
    videoBuffer: Buffer,
): { found: boolean; payload: string | null } {
    const magicLen = VIDEO_STEG_MAGIC.length;

    if (videoBuffer.length < magicLen + 4 + 1) {
        return { found: false, payload: null };
    }

    // Scan backwards for the magic marker
    let markerIndex = -1;
    for (let i = videoBuffer.length - magicLen - 4 - 1; i >= 0; i--) {
        if (videoBuffer.subarray(i, i + magicLen).equals(VIDEO_STEG_MAGIC)) {
            markerIndex = i;
            break;
        }
    }

    if (markerIndex < 0) {
        return { found: false, payload: null };
    }

    const lengthOffset = markerIndex + magicLen;
    if (lengthOffset + 4 > videoBuffer.length) {
        return { found: false, payload: null };
    }

    const payloadLength = videoBuffer.readUInt32BE(lengthOffset);
    const payloadOffset = lengthOffset + 4;

    if (payloadOffset + payloadLength > videoBuffer.length) {
        return { found: false, payload: null };
    }

    const payload = videoBuffer.subarray(payloadOffset, payloadOffset + payloadLength).toString("utf-8");

    if (!payload.trim()) {
        return { found: false, payload: null };
    }

    return { found: true, payload };
}

/**
 * Full decode + decrypt pipeline for video steganography.
 */
export function decodeAndDecryptVideo(
    videoBuffer: Buffer,
    password?: string,
): {
    found: boolean;
    secretText: string | null;
    passwordRequired: boolean;
} {
    const { found, payload } = decodeVideo(videoBuffer);

    if (!found || !payload) {
        return { found: false, secretText: null, passwordRequired: false };
    }

    if (isPasswordProtectedPayload(payload)) {
        const { text, passwordRequired } = decryptSecretText(payload, password);
        if (passwordRequired) {
            return { found: true, secretText: null, passwordRequired: true };
        }
        return { found: true, secretText: text, passwordRequired: false };
    }

    return { found: true, secretText: payload, passwordRequired: false };
}

/** Download video from URL or data-URI and return as Buffer. */
export async function downloadVideo(url: string): Promise<Buffer> {
    if (url.startsWith("data:video/")) {
        const base64Part = url.split("base64,").pop() ?? "";
        return Buffer.from(base64Part, "base64");
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!resp.ok) {
        throw new Error(`Failed to download video: ${resp.status}`);
    }
    return Buffer.from(await resp.arrayBuffer());
}
