/**
 * LSB steganography — Node port of Nexus_backend/routes/steganography.py
 * Uses jimp for pixel-level R-channel LSB encode/decode.
 * Optional password layer: AES-256-GCM with scrypt-derived key.
 */

import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scryptSync,
} from "crypto";
import { Jimp } from "jimp";
import { methods as resizeMethods } from "@jimp/plugin-resize";

const DELIMITER = Buffer.from([0xfe, 0xfe]);
const PWD_MAGIC = "STEGPWD1:";

/** Strip data-URI prefix and whitespace from client-provided base64. */
export function normalizeImageBase64(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.includes("base64,")) {
        return trimmed.split("base64,").pop()?.replace(/\s/g, "") ?? "";
    }
    if (trimmed.startsWith("data:")) {
        return trimmed.split(",").pop()?.replace(/\s/g, "") ?? "";
    }
    return trimmed.replace(/\s/g, "");
}

export function stegHttpStatus(message: string): 400 | 413 | 500 {
    if (/image too small/i.test(message)) {
        return 413;
    }
    if (
        /could not find mime|unsupported|invalid image|failed to download image/i.test(
            message,
        )
    ) {
        return 400;
    }
    return 500;
}

function textToBits(text: string): number[] {
    const data = Buffer.concat([Buffer.from(text, "utf-8"), DELIMITER]);
    const bits: number[] = [];
    for (const byte of data) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    }
    return bits;
}

function bitsToText(bits: number[]): string {
    const bytes: number[] = [];
    for (let i = 0; i <= bits.length - 8; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte = (byte << 1) | bits[i + j];
        }
        bytes.push(byte);
        if (bytes.length >= 2 && bytes[bytes.length - 2] === 0xfe && bytes[bytes.length - 1] === 0xfe) {
            return Buffer.from(bytes.slice(0, -2)).toString("utf-8");
        }
    }
    return Buffer.from(bytes).toString("utf-8");
}

export function isPasswordProtectedPayload(payload: string): boolean {
    return payload.startsWith(PWD_MAGIC);
}

export function encryptSecretText(text: string, password?: string): string {
    const trimmed = password?.trim();
    if (!trimmed) {
        return text;
    }

    const salt = randomBytes(16);
    const key = scryptSync(trimmed, salt, 32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    return PWD_MAGIC + combined.toString("base64");
}

export function decryptSecretText(
    payload: string,
    password?: string,
): { text: string | null; passwordRequired: boolean } {
    if (!isPasswordProtectedPayload(payload)) {
        return { text: payload, passwordRequired: false };
    }

    const trimmed = password?.trim();
    if (!trimmed) {
        return { text: null, passwordRequired: true };
    }

    try {
        const combined = Buffer.from(payload.slice(PWD_MAGIC.length), "base64");
        const salt = combined.subarray(0, 16);
        const iv = combined.subarray(16, 28);
        const tag = combined.subarray(28, 44);
        const encrypted = combined.subarray(44);
        const key = scryptSync(trimmed, salt, 32);
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const text = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
        return { text, passwordRequired: false };
    } catch {
        throw new Error("Incorrect password");
    }
}

const MAX_STEG_DIMENSION = 2048;

export async function encodeImage(
    imageBytes: Buffer,
    secretText: string,
    password?: string,
): Promise<Buffer> {
    const payload = encryptSecretText(secretText, password);
    const image = await Jimp.read(imageBytes);

    if (Math.max(image.bitmap.width, image.bitmap.height) > MAX_STEG_DIMENSION) {
        resizeMethods.scaleToFit(image, { w: MAX_STEG_DIMENSION, h: MAX_STEG_DIMENSION });
    }

    const bits = textToBits(payload);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const pixelCount = width * height;

    if (bits.length > pixelCount) {
        throw new Error(
            `Image too small to hide this message (need ${bits.length} pixels, have ${pixelCount})`,
        );
    }

    let bitIndex = 0;
    image.scan(0, 0, width, height, (_x, _y, idx) => {
        if (bitIndex < bits.length) {
            image.bitmap.data[idx] = (image.bitmap.data[idx] & 0xfe) | bits[bitIndex];
            bitIndex++;
        }
    });

    const encoded = await image.getBuffer("image/png");
    return Buffer.from(encoded);
}

export async function decodeImage(imageBytes: Buffer): Promise<string> {
    const image = await Jimp.read(imageBytes);
    const bits: number[] = [];
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    image.scan(0, 0, width, height, (_x, _y, idx) => {
        bits.push(image.bitmap.data[idx] & 1);
    });

    return bitsToText(bits);
}

export async function downloadImage(url: string): Promise<Buffer> {
    if (url.startsWith("data:image/")) {
        const base64Part = url.split("base64,").pop() ?? "";
        return Buffer.from(base64Part, "base64");
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
        throw new Error(`Failed to download image: ${resp.status}`);
    }
    return Buffer.from(await resp.arrayBuffer());
}
