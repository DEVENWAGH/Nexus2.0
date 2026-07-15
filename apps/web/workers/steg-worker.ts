/**
 * steg-worker.ts — Client-side steganography Web Worker.
 *
 * All steganographic encode/decode operations run in this isolated worker so
 * the main UI thread is never blocked during heavy pixel or binary manipulation.
 *
 * Supported media types:
 *   • image  — LSB pixel encoding via OffscreenCanvas (identical algorithm to
 *              the server's Jimp-based implementation)
 *   • audio  — Binary-append after NEXUS_AUDIO_STEG magic marker
 *   • video  — Binary-append after NEXUS_VIDEO_STEG magic marker
 *   • pdf    — Post-EOF injection after %%EOF marker
 *
 * Encryption layer:
 *   When a password is provided, the payload is encrypted using AES-256-GCM
 *   with a key derived via PBKDF2 (scrypt-compatible derivation).
 *   Magic prefix: "STEGPWD1:"
 *
 * Message protocol:
 *   IN:  { type: "encode" | "decode", mediaType, fileBuffer, secretText?, password?, requestId }
 *   OUT: { type: "result", result, requestId }
 *        { type: "error",  message, requestId }
 */

/// <reference lib="webworker" />

// ── Password-based encryption (AES-256-GCM + PBKDF2) ─────────────────────

const PWD_MAGIC = "STEGPWD1:";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

async function derivePwdKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptPayload(text: string, password?: string): Promise<string> {
  if (!password?.trim()) return text;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await derivePwdKey(password, salt);
  const ct   = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const tag  = ct.slice(-16);
  const enc  = ct.slice(0, -16);
  // Layout: salt(16) | iv(12) | tag(16) | enc
  const combined = new Uint8Array(salt.length + iv.length + tag.length + enc.length);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(tag, 28);
  combined.set(enc, 44);
  return PWD_MAGIC + toHex(combined);
}

async function decryptPayload(payload: string, password?: string): Promise<{ text: string | null; passwordRequired: boolean }> {
  if (!payload.startsWith(PWD_MAGIC)) return { text: payload, passwordRequired: false };
  if (!password?.trim()) return { text: null, passwordRequired: true };
  try {
    const combined = fromHex(payload.slice(PWD_MAGIC.length));
    const salt = combined.slice(0, 16);
    const iv   = combined.slice(16, 28);
    const tag  = combined.slice(28, 44);
    const enc  = combined.slice(44);
    const key  = await derivePwdKey(password, salt);
    const ctWithTag = new Uint8Array(enc.length + tag.length);
    ctWithTag.set(enc, 0);
    ctWithTag.set(tag, enc.length);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ctWithTag);
    return { text: new TextDecoder().decode(plain), passwordRequired: false };
  } catch {
    throw new Error("Incorrect password");
  }
}

// ── Image steganography (LSB R-channel via OffscreenCanvas) ───────────────

const DELIMITER = new Uint8Array([0xfe, 0xfe]);

function textToBits(text: string): number[] {
  const data = new TextEncoder().encode(text);
  const withDelim = new Uint8Array(data.length + DELIMITER.length);
  withDelim.set(data); withDelim.set(DELIMITER, data.length);
  const bits: number[] = [];
  for (const byte of withDelim) for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  return bits;
}

function bitsToText(bits: number[]): string {
  const bytes: number[] = [];
  for (let i = 0; i <= bits.length - 8; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
    if (bytes.length >= 2 && bytes[bytes.length - 2] === 0xfe && bytes[bytes.length - 1] === 0xfe) {
      return new TextDecoder().decode(new Uint8Array(bytes.slice(0, -2)));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

async function encodeImage(fileBuffer: ArrayBuffer, secretText: string, password?: string): Promise<ArrayBuffer> {
  const payload = await encryptPayload(secretText, password);
  const bits = textToBits(payload);

  const blob = new Blob([fileBuffer]);
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const pixelCount = canvas.width * canvas.height;

  if (bits.length > pixelCount) throw new Error(`Image too small for this message (need ${bits.length} pixels)`);

  for (let i = 0; i < bits.length; i++) {
    data[i * 4] = (data[i * 4] & 0xfe) | bits[i]; // R-channel LSB
  }
  ctx.putImageData(imageData, 0, 0);
  const resultBlob = await canvas.convertToBlob({ type: "image/png" });
  return resultBlob.arrayBuffer();
}

async function decodeImage(fileBuffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([fileBuffer]);
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bits: number[] = [];
  for (let i = 0; i < canvas.width * canvas.height; i++) bits.push(imageData.data[i * 4] & 1);
  return bitsToText(bits);
}

// ── Audio steganography (binary append) ───────────────────────────────────

const AUDIO_MAGIC = new TextEncoder().encode("NEXUS_AUDIO_STEG");

function encodeAudio(fileBuffer: ArrayBuffer, secretText: string, password: string): ArrayBuffer {
  // Note: password sync encryption applied before calling this (encryptPayload is async, handled by caller)
  const payload = new TextEncoder().encode(secretText);
  const lengthBuf = new Uint8Array(4);
  new DataView(lengthBuf.buffer).setUint32(0, payload.length, false);

  const original = new Uint8Array(fileBuffer);
  const result = new Uint8Array(original.length + AUDIO_MAGIC.length + 4 + payload.length);
  result.set(original, 0);
  result.set(AUDIO_MAGIC, original.length);
  result.set(lengthBuf, original.length + AUDIO_MAGIC.length);
  result.set(payload, original.length + AUDIO_MAGIC.length + 4);
  return result.buffer;
}

function decodeAudio(fileBuffer: ArrayBuffer): string | null {
  const data = new Uint8Array(fileBuffer);
  const magicLen = AUDIO_MAGIC.length;
  let markerIndex = -1;

  for (let i = data.length - magicLen - 4 - 1; i >= 0; i--) {
    let match = true;
    for (let j = 0; j < magicLen; j++) {
      if (data[i + j] !== AUDIO_MAGIC[j]) { match = false; break; }
    }
    if (match) { markerIndex = i; break; }
  }
  if (markerIndex < 0) return null;

  const lengthOffset = markerIndex + magicLen;
  const payloadLength = new DataView(data.buffer, lengthOffset, 4).getUint32(0, false);
  const payloadOffset = lengthOffset + 4;
  if (payloadOffset + payloadLength > data.length) return null;
  return new TextDecoder().decode(data.slice(payloadOffset, payloadOffset + payloadLength));
}

// ── Video steganography (binary append) ───────────────────────────────────

const VIDEO_MAGIC = new TextEncoder().encode("NEXUS_VIDEO_STEG");

function encodeVideo(fileBuffer: ArrayBuffer, secretText: string): ArrayBuffer {
  const payload = new TextEncoder().encode(secretText);
  const lengthBuf = new Uint8Array(4);
  new DataView(lengthBuf.buffer).setUint32(0, payload.length, false);

  const original = new Uint8Array(fileBuffer);
  const result = new Uint8Array(original.length + VIDEO_MAGIC.length + 4 + payload.length);
  result.set(original, 0);
  result.set(VIDEO_MAGIC, original.length);
  result.set(lengthBuf, original.length + VIDEO_MAGIC.length);
  result.set(payload, original.length + VIDEO_MAGIC.length + 4);
  return result.buffer;
}

function decodeVideo(fileBuffer: ArrayBuffer): string | null {
  const data = new Uint8Array(fileBuffer);
  const magicLen = VIDEO_MAGIC.length;
  let markerIndex = -1;

  for (let i = data.length - magicLen - 4 - 1; i >= 0; i--) {
    let match = true;
    for (let j = 0; j < magicLen; j++) {
      if (data[i + j] !== VIDEO_MAGIC[j]) { match = false; break; }
    }
    if (match) { markerIndex = i; break; }
  }
  if (markerIndex < 0) return null;

  const lengthOffset = markerIndex + magicLen;
  const payloadLength = new DataView(data.buffer, lengthOffset, 4).getUint32(0, false);
  const payloadOffset = lengthOffset + 4;
  if (payloadOffset + payloadLength > data.length) return null;
  return new TextDecoder().decode(data.slice(payloadOffset, payloadOffset + payloadLength));
}

// ── PDF steganography (post-EOF injection) ─────────────────────────────────

const PDF_STEG_MAGIC = "%%NEXUSSTEG:";
const PDF_EOF = new TextEncoder().encode("%%EOF");

function encodePdf(fileBuffer: ArrayBuffer, secretText: string): ArrayBuffer {
  const payload = PDF_STEG_MAGIC + secretText + "::END";
  const payloadBytes = new TextEncoder().encode("\n" + payload);
  const original = new Uint8Array(fileBuffer);
  const result = new Uint8Array(original.length + payloadBytes.length);
  result.set(original); result.set(payloadBytes, original.length);
  return result.buffer;
}

function decodePdf(fileBuffer: ArrayBuffer): string | null {
  const text = new TextDecoder().decode(fileBuffer);
  const idx = text.indexOf(PDF_STEG_MAGIC);
  if (idx < 0) return null;
  const start = idx + PDF_STEG_MAGIC.length;
  const end = text.indexOf("::END", start);
  if (end < 0) return null;
  return text.slice(start, end).trim();
}

// ── Message handler ───────────────────────────────────────────────────────

type InMessage = {
  type: "encode" | "decode";
  mediaType: "image" | "audio" | "video" | "pdf";
  fileBuffer: ArrayBuffer;
  secretText?: string;
  password?: string;
  requestId: string;
};

self.addEventListener("message", async (event: MessageEvent<InMessage>) => {
  const { type, mediaType, fileBuffer, secretText, password, requestId } = event.data;

  try {
    if (type === "encode") {
      if (!secretText) throw new Error("secretText is required for encoding");
      let resultBuffer: ArrayBuffer;
      const encryptedPayload = await encryptPayload(secretText, password);

      switch (mediaType) {
        case "image":
          resultBuffer = await encodeImage(fileBuffer, secretText, password);
          break;
        case "audio":
          resultBuffer = encodeAudio(fileBuffer, encryptedPayload, password ?? "");
          break;
        case "video":
          resultBuffer = encodeVideo(fileBuffer, encryptedPayload);
          break;
        case "pdf":
          resultBuffer = encodePdf(fileBuffer, encryptedPayload);
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType as string}`);
      }
      self.postMessage({ type: "result", result: resultBuffer, requestId }, { transfer: [resultBuffer] });

    } else if (type === "decode") {
      let rawPayload: string | null;

      switch (mediaType) {
        case "image":
          rawPayload = await decodeImage(fileBuffer);
          break;
        case "audio":
          rawPayload = decodeAudio(fileBuffer);
          break;
        case "video":
          rawPayload = decodeVideo(fileBuffer);
          break;
        case "pdf":
          rawPayload = decodePdf(fileBuffer);
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType as string}`);
      }

      if (!rawPayload) {
        self.postMessage({ type: "result", result: { found: false, secretText: null, passwordRequired: false }, requestId });
        return;
      }

      const { text, passwordRequired } = await decryptPayload(rawPayload, password);
      self.postMessage({ type: "result", result: { found: true, secretText: text, passwordRequired }, requestId });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: (err as Error).message ?? "Unknown error", requestId });
  }
});
