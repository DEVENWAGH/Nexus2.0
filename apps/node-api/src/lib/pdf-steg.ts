/**
 * Steganography for PDF files — hide messages after the %%EOF marker.
 *
 * PDF readers stop parsing at the %%EOF marker, so any data appended after
 * it is invisible to standard readers but can be recovered programmatically.
 *
 * Uses the same AES-256-GCM + scrypt encryption as image steganography.
 */

import { encryptSecretText, decryptSecretText, isPasswordProtectedPayload } from "./steganography";

/** 16-byte magic marker placed before our payload (after the PDF EOF). */
const PDF_STEG_MAGIC = Buffer.from("NEXUS_PDFST_STEG", "ascii");

/**
 * Encode a secret message into a PDF buffer by appending it after the
 * PDF content. The original PDF bytes are left completely untouched.
 */
export function encodePdf(
    pdfBuffer: Buffer,
    secretText: string,
    password?: string,
): Buffer {
    if (!secretText.trim()) {
        throw new Error("secret_text is required");
    }

    // Verify this looks like a PDF
    const header = pdfBuffer.subarray(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
        throw new Error("Not a valid PDF file");
    }

    const payload = encryptSecretText(secretText.trim(), password);
    const payloadBuf = Buffer.from(payload, "utf-8");

    // Layout: [original PDF] [MAGIC] [4-byte payload length BE] [payload]
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(payloadBuf.length, 0);

    return Buffer.concat([pdfBuffer, PDF_STEG_MAGIC, lengthBuf, payloadBuf]);
}

/**
 * Decode a hidden message from a PDF buffer.
 * Returns the raw payload string (may be password-protected).
 */
export function decodePdf(
    pdfBuffer: Buffer,
): { found: boolean; payload: string | null } {
    const magicLen = PDF_STEG_MAGIC.length;

    if (pdfBuffer.length < magicLen + 4 + 1) {
        return { found: false, payload: null };
    }

    // Scan backwards for the magic marker
    let markerIndex = -1;
    for (let i = pdfBuffer.length - magicLen - 4 - 1; i >= 0; i--) {
        if (pdfBuffer.subarray(i, i + magicLen).equals(PDF_STEG_MAGIC)) {
            markerIndex = i;
            break;
        }
    }

    if (markerIndex < 0) {
        return { found: false, payload: null };
    }

    const lengthOffset = markerIndex + magicLen;
    if (lengthOffset + 4 > pdfBuffer.length) {
        return { found: false, payload: null };
    }

    const payloadLength = pdfBuffer.readUInt32BE(lengthOffset);
    const payloadOffset = lengthOffset + 4;

    if (payloadOffset + payloadLength > pdfBuffer.length) {
        return { found: false, payload: null };
    }

    const payload = pdfBuffer.subarray(payloadOffset, payloadOffset + payloadLength).toString("utf-8");

    if (!payload.trim()) {
        return { found: false, payload: null };
    }

    return { found: true, payload };
}

/**
 * Full decode + decrypt pipeline for PDF steganography.
 */
export function decodeAndDecryptPdf(
    pdfBuffer: Buffer,
    password?: string,
): {
    found: boolean;
    secretText: string | null;
    passwordRequired: boolean;
} {
    const { found, payload } = decodePdf(pdfBuffer);

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

/** Download PDF from URL or data-URI and return as Buffer. */
export async function downloadPdf(url: string): Promise<Buffer> {
    if (url.startsWith("data:application/pdf")) {
        const base64Part = url.split("base64,").pop() ?? "";
        return Buffer.from(base64Part, "base64");
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) {
        throw new Error(`Failed to download PDF: ${resp.status}`);
    }
    return Buffer.from(await resp.arrayBuffer());
}
