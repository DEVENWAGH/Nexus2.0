/**
 * Append-based steganography for audio files (MP3, WAV, OGG, AAC, FLAC).
 *
 * Strategy: append an encrypted / plain-text payload after a unique magic
 * delimiter at the end of the audio binary. Audio decoders ignore trailing
 * bytes, so the file plays normally while carrying a hidden message.
 *
 * Uses the same AES-256-GCM + scrypt encryption as image steganography.
 */

import { encryptSecretText, decryptSecretText, isPasswordProtectedPayload } from "./steganography";

/** 16-byte magic marker — chosen to be extremely unlikely in real audio data. */
const AUDIO_STEG_MAGIC = Buffer.from("NEXUS_AUDIO_STEG", "ascii");

/**
 * Encode a secret message into an audio buffer by appending it after a
 * delimiter. The original audio bytes are left completely untouched.
 */
export function encodeAudio(
    audioBuffer: Buffer,
    secretText: string,
    password?: string,
): Buffer {
    if (!secretText.trim()) {
        throw new Error("secret_text is required");
    }

    const payload = encryptSecretText(secretText.trim(), password);
    const payloadBuf = Buffer.from(payload, "utf-8");

    // Layout: [original audio] [MAGIC] [4-byte payload length BE] [payload]
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(payloadBuf.length, 0);

    return Buffer.concat([audioBuffer, AUDIO_STEG_MAGIC, lengthBuf, payloadBuf]);
}

/**
 * Decode a hidden message from an audio buffer.
 * Returns the raw payload string (may be password-protected).
 */
export function decodeAudio(
    audioBuffer: Buffer,
): { found: boolean; payload: string | null } {
    // Search backwards for the magic marker
    const magicLen = AUDIO_STEG_MAGIC.length;

    // The minimum structure is: MAGIC(16) + LENGTH(4) + at least 1 byte payload
    if (audioBuffer.length < magicLen + 4 + 1) {
        return { found: false, payload: null };
    }

    // Scan from the end. The marker could be anywhere if the file was re-encoded,
    // but in our case it's always right after the original audio.
    let markerIndex = -1;
    for (let i = audioBuffer.length - magicLen - 4 - 1; i >= 0; i--) {
        if (audioBuffer.subarray(i, i + magicLen).equals(AUDIO_STEG_MAGIC)) {
            markerIndex = i;
            break;
        }
    }

    if (markerIndex < 0) {
        return { found: false, payload: null };
    }

    const lengthOffset = markerIndex + magicLen;
    if (lengthOffset + 4 > audioBuffer.length) {
        return { found: false, payload: null };
    }

    const payloadLength = audioBuffer.readUInt32BE(lengthOffset);
    const payloadOffset = lengthOffset + 4;

    if (payloadOffset + payloadLength > audioBuffer.length) {
        return { found: false, payload: null };
    }

    const payload = audioBuffer.subarray(payloadOffset, payloadOffset + payloadLength).toString("utf-8");

    if (!payload.trim()) {
        return { found: false, payload: null };
    }

    return { found: true, payload };
}

/**
 * Full decode + decrypt pipeline for audio steganography.
 */
export function decodeAndDecryptAudio(
    audioBuffer: Buffer,
    password?: string,
): {
    found: boolean;
    secretText: string | null;
    passwordRequired: boolean;
} {
    const { found, payload } = decodeAudio(audioBuffer);

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

/** Download audio from URL or data-URI and return as Buffer. */
export async function downloadAudio(url: string): Promise<Buffer> {
    if (url.startsWith("data:audio/") || url.startsWith("data:application/")) {
        const base64Part = url.split("base64,").pop() ?? "";
        return Buffer.from(base64Part, "base64");
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) {
        throw new Error(`Failed to download audio: ${resp.status}`);
    }
    return Buffer.from(await resp.arrayBuffer());
}
