/**
 * AES-256-GCM encryption — TypeScript port of Nexus_backend/encryption.py.
 * Compatible with messages encrypted by the Python backend.
 */

const AES_KEY_SIZE = 256;
const MASTER_SALT = new TextEncoder().encode("nexus-backend-salt-v1");
const MASTER_ITERATIONS = 100_000;
const CHANNEL_ITERATIONS = 50_000;

export type EncryptedPayload = {
    nonce: string;
    ciphertext: string;
    v: number;
};

function getMasterKeyEnv(): string {
    if (typeof process !== "undefined" && process.env?.ENCRYPTION_MASTER_KEY) {
        return process.env.ENCRYPTION_MASTER_KEY;
    }
    if (typeof globalThis !== "undefined") {
        const env = (globalThis as { __ENCRYPTION_MASTER_KEY__?: string })
            .__ENCRYPTION_MASTER_KEY__;
        if (env) return env;
    }
    return "nexus-chat-default-key-change-me";
}

async function deriveAesKey(
    password: string,
    salt: BufferSource,
    iterations: number,
): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: AES_KEY_SIZE },
        false,
        ["encrypt", "decrypt"],
    );
}

async function deriveChannelKey(channelId: string): Promise<CryptoKey> {
    const masterKey = getMasterKeyEnv();
    const salt = new TextEncoder().encode(channelId);
    return deriveAesKey(masterKey, salt, CHANNEL_ITERATIONS);
}

function toBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(bytes).toString("base64");
    }
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(base64, "base64"));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function isEncrypted(content: string): boolean {
    try {
        const data = JSON.parse(content) as EncryptedPayload;
        return Boolean(data.nonce && data.ciphertext);
    } catch {
        return false;
    }
}

export async function encryptMessage(
    plaintext: string,
    channelId: string,
): Promise<string> {
    const key = await deriveChannelKey(channelId);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        key,
        new TextEncoder().encode(plaintext),
    );

    const payload: EncryptedPayload = {
        nonce: toBase64(nonce),
        ciphertext: toBase64(new Uint8Array(ciphertext)),
        v: 1,
    };
    return JSON.stringify(payload);
}

export async function decryptMessage(
    encryptedJson: string,
    channelId: string,
): Promise<string> {
    try {
        const data = JSON.parse(encryptedJson) as EncryptedPayload;
        const key = await deriveChannelKey(channelId);
        const nonce = new Uint8Array(fromBase64(data.nonce));
        const ciphertext = new Uint8Array(fromBase64(data.ciphertext));

        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce },
            key,
            ciphertext,
        );
        return new TextDecoder().decode(plaintext);
    } catch {
        return encryptedJson;
    }
}

export async function hashMessageAsync(message: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(message),
    );
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export const SUSPICIOUS_KEYWORDS = [
    "hack",
    "exploit",
    "inject",
    "drop table",
    "rm -rf",
    "<script>",
    "eval(",
    "exec(",
    "malware",
    "virus",
];

export function isSuspicious(message: string): {
    suspicious: boolean;
    reasons: string[];
} {
    const lower = message.toLowerCase();
    const found = SUSPICIOUS_KEYWORDS.filter((kw) => lower.includes(kw));
    return {
        suspicious: found.length > 0,
        reasons: found.length > 0 ? [`Suspicious keywords: ${found.join(", ")}`] : [],
    };
}
