/**
 * Standalone SHA-256 hasher for Node.js environment (no WebCrypto dependency).
 */
import { createHash } from "node:crypto";

export async function hashMessageAsync(message: string): Promise<string> {
    return createHash("sha256").update(message, "utf8").digest("hex");
}

export function isSuspicious(message: string): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (/\b(exec|eval|base64_decode|system|shell_exec)\b/i.test(message)) {
        reasons.push("Potential code injection payload");
    }
    if (message.length > 65536) {
        reasons.push("Oversized payload (> 64KB)");
    }
    return { suspicious: reasons.length > 0, reasons };
}
