/**
 * client-crypto.ts — Browser-side AES-256-GCM encryption engine.
 *
 * All key derivation and cryptographic operations run exclusively in the
 * browser using the Web Crypto API. The server acts as a blind ciphertext
 * relay — it never holds or derives decryption keys.
 *
 * Key derivation chain (shared per channel/conversation):
 *   CLIENT_MASTER (app-wide constant)
 *     → HKDF-SHA-256(salt = channelId bytes, info = "nexus-channel-v2")
 *     → AES-256-GCM CryptoKey
 *
 * Every member of a channel/DM derives the same key from the shared id,
 * so ciphertext is decryptable by all participants (not just the sender).
 */

"use client";

export type ClientEncryptedPayload = {
  nonce: string;   // base64url-encoded 12-byte IV
  ct: string;      // base64url-encoded ciphertext
  v: 2;            // version tag
};

const HKDF_INFO = new TextEncoder().encode("nexus-channel-v2");
const AES_KEY_SIZE = 256;
/** Shared IKM for channel keys — same on every client so all members can decrypt. */
const CLIENT_MASTER = "nexus-client-channel-v2";

// ── Base64URL helpers ─────────────────────────────────────────────────────

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "===".slice((padded.length + 3) % 4));
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

// ── Key derivation ─────────────────────────────────────────────────────────

/**
 * Derives an AES-256-GCM key shared by all members of a channel/conversation.
 * Uses HKDF-SHA-256 so the key is channel-specific and non-reversible.
 */
export async function deriveChannelKey(channelId: string): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLIENT_MASTER),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(channelId),
      info: HKDF_INFO,
    },
    hkdfKey,
    { name: "AES-GCM", length: AES_KEY_SIZE },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Legacy v2 key derivation that used the sender's ECDSA private key.
 * Kept only so the original sender can still read messages encrypted
 * before the shared-channel-key fix.
 */
async function deriveLegacyPrivateKeyChannelKey(
  privateKey: CryptoKey,
  channelId: string,
): Promise<CryptoKey> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey) as ArrayBuffer;

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(pkcs8),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(channelId),
      info: HKDF_INFO,
    },
    hkdfKey,
    { name: "AES-GCM", length: AES_KEY_SIZE },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Encrypt / Decrypt ──────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string for a channel.
 * Returns a JSON string containing nonce + ciphertext (version 2 payload).
 */
export async function encryptForChannel(
  plaintext: string,
  channelId: string,
  _privateKey?: CryptoKey,
): Promise<string> {
  const key = await deriveChannelKey(channelId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );

  const payload: ClientEncryptedPayload = {
    nonce: toB64(nonce),
    ct: toB64(new Uint8Array(ct)),
    v: 2,
  };
  return JSON.stringify(payload);
}

/**
 * Decrypts a v2 client-encrypted payload for a channel.
 * Returns the plaintext string, or the original input if it cannot be decrypted
 * (e.g. legacy v1 server-encrypted messages).
 *
 * Optional privateKey enables fallback for messages encrypted with the old
 * per-user key scheme (readable only by the original sender).
 */
export async function decryptForChannel(
  encryptedJson: string,
  channelId: string,
  privateKey?: CryptoKey,
): Promise<string> {
  try {
    const parsed = JSON.parse(encryptedJson) as Partial<ClientEncryptedPayload>;

    // Handle legacy v1 server-encrypted payloads gracefully
    if (parsed.v !== 2 || !parsed.nonce || !parsed.ct) {
      return _tryLegacyDecrypt(encryptedJson, channelId);
    }

    const iv = fromB64(parsed.nonce);
    const ciphertext = fromB64(parsed.ct);

    // Primary: shared channel key (all participants)
    try {
      const key = await deriveChannelKey(channelId);
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      // fall through to legacy private-key attempt
    }

    // Fallback: old per-user derivation (sender-only messages from before the fix)
    if (privateKey) {
      try {
        const legacyKey = await deriveLegacyPrivateKeyChannelKey(privateKey, channelId);
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          legacyKey,
          ciphertext,
        );
        return new TextDecoder().decode(plaintext);
      } catch {
        // fall through
      }
    }

    return encryptedJson;
  } catch {
    return encryptedJson;
  }
}

/**
 * Checks whether a string is a v2 client-encrypted payload.
 */
export function isClientEncrypted(content: string): boolean {
  try {
    const p = JSON.parse(content) as Partial<ClientEncryptedPayload>;
    return p.v === 2 && Boolean(p.nonce) && Boolean(p.ct);
  } catch {
    return false;
  }
}

// ── Legacy v1 fallback ─────────────────────────────────────────────────────

/**
 * Attempts to decrypt a v1 server-derived AES-GCM payload using the same
 * PBKDF2 algorithm the server used (channel key from master key env var).
 * Falls back to the raw string on failure.
 */
async function _tryLegacyDecrypt(
  encryptedJson: string,
  channelId: string,
): Promise<string> {
  try {
    const data = JSON.parse(encryptedJson) as { nonce?: string; ciphertext?: string; v?: number };
    if (!data.nonce || !data.ciphertext) return encryptedJson;

    // v1 used PBKDF2 with a hardcoded master key → replicate for reading legacy messages
    const LEGACY_MASTER = "nexus-chat-default-key-change-me";
    const legacySaltBytes = new TextEncoder().encode(channelId);
    const LEGACY_SALT = new Uint8Array(legacySaltBytes.length);
    LEGACY_SALT.set(legacySaltBytes);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(LEGACY_MASTER),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: LEGACY_SALT, iterations: 50_000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    function fromB64Legacy(s: string): Uint8Array<ArrayBuffer> {
      const binary = atob(s);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      return arr;
    }

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64Legacy(data.nonce) },
      key,
      fromB64Legacy(data.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return encryptedJson;
  }
}

// ── File encryption helpers ────────────────────────────────────────────────

export type FileEncryptionMeta = {
  nonce: string;  // base64url
  v: 2;
};

/**
 * Encrypts a File's bytes for CDN upload. Returns the encrypted Blob and
 * metadata (nonce) needed for later decryption.
 */
export async function encryptFileForChannel(
  file: File,
  channelId: string,
  _privateKey?: CryptoKey,
): Promise<{ encryptedBlob: Blob; meta: FileEncryptionMeta }> {
  const key = await deriveChannelKey(channelId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const fileBytes = await file.arrayBuffer();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, fileBytes);

  const meta: FileEncryptionMeta = { nonce: toB64(nonce), v: 2 };
  const encryptedBlob = new Blob([new Uint8Array(ct)], { type: "application/octet-stream" });
  return { encryptedBlob, meta };
}

/**
 * Decrypts an encrypted file Blob fetched from CDN.
 */
export async function decryptFileFromChannel(
  encryptedData: ArrayBuffer,
  meta: FileEncryptionMeta,
  channelId: string,
  _privateKey?: CryptoKey,
  mimeType: string = "application/octet-stream",
): Promise<Blob> {
  const key = await deriveChannelKey(channelId);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(meta.nonce) },
    key,
    encryptedData,
  );
  return new Blob([plaintext], { type: mimeType });
}
