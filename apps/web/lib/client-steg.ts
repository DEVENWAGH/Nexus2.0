/**
 * client-steg.ts — Main-thread façade for the steganography Web Worker.
 *
 * Replaces all /api/steganography/* network calls with direct in-browser
 * processing. Files never leave the device for steganographic processing.
 */

"use client";

type StegMediaType = "image" | "audio" | "video" | "pdf";

type StegWorkerResult =
  | ArrayBuffer
  | { found: boolean; secretText: string | null; passwordRequired: boolean };

let _worker: Worker | null = null;

function getStegWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../workers/steg-worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return _worker;
}

function callWorker(
  type: "encode" | "decode",
  mediaType: StegMediaType,
  fileBuffer: ArrayBuffer,
  options: { secretText?: string; password?: string },
): Promise<StegWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = getStegWorker();
    const requestId = crypto.randomUUID();

    const handler = (e: MessageEvent) => {
      const msg = e.data as {
        type: "result" | "error";
        result?: StegWorkerResult;
        message?: string;
        requestId: string;
      };
      if (msg.requestId !== requestId) return;
      worker.removeEventListener("message", handler);
      if (msg.type === "error") reject(new Error(msg.message ?? "Steg worker error"));
      else resolve(msg.result!);
    };

    worker.addEventListener("message", handler);

    // Transfer the ArrayBuffer to avoid copying large files
    const bufferCopy = fileBuffer.slice(0);
    worker.postMessage(
      { type, mediaType, fileBuffer: bufferCopy, ...options, requestId },
      { transfer: [bufferCopy] },
    );
  });
}

// ── Detect media type from File ────────────────────────────────────────────

export function detectStegMediaType(file: File): StegMediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf") return "pdf";
  return "image"; // default fallback
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Encodes a secret text into a media file using steganography.
 * Returns the encoded file as a Blob (preserves original mime type for non-images; images become PNG).
 */
export async function encodeSteg(
  file: File,
  secretText: string,
  password?: string,
): Promise<Blob> {
  const mediaType = detectStegMediaType(file);
  const fileBuffer = await file.arrayBuffer();
  const resultBuffer = (await callWorker("encode", mediaType, fileBuffer, { secretText, password })) as ArrayBuffer;

  const mimeType = mediaType === "image" ? "image/png" : file.type;
  return new Blob([resultBuffer], { type: mimeType });
}

/**
 * Decodes a hidden message from a media file.
 */
export async function decodeSteg(
  file: File,
  password?: string,
): Promise<{ found: boolean; secretText: string | null; passwordRequired: boolean }> {
  const mediaType = detectStegMediaType(file);
  const fileBuffer = await file.arrayBuffer();
  return (await callWorker("decode", mediaType, fileBuffer, { password })) as {
    found: boolean;
    secretText: string | null;
    passwordRequired: boolean;
  };
}

/**
 * Decodes from a URL by fetching the file first.
 */
export async function decodeStegFromUrl(
  url: string,
  mimeType: string,
  password?: string,
): Promise<{ found: boolean; secretText: string | null; passwordRequired: boolean }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch file for decoding: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const file = new File([buffer], "media", { type: mimeType });
  return decodeSteg(file, password);
}

/**
 * Encodes from URL (for decode-then-re-encode workflows).
 */
export async function encodeStegFromUrl(
  url: string,
  mimeType: string,
  secretText: string,
  password?: string,
): Promise<Blob> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch file for encoding: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const file = new File([buffer], "media", { type: mimeType });
  return encodeSteg(file, secretText, password);
}
