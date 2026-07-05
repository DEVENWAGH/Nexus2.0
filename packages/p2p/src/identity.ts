/**
 * W3C-compliant Decentralized Identity (DID) key generation and signatures.
 * Uses browser-native Web Crypto API.
 */

export type KeyPair = {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
};

/** Generates an ECDSA P-256 cryptographic key pair for DID. */
export async function generateDIDKeyPair(): Promise<KeyPair> {
    return crypto.subtle.generateKey(
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        true, // extractable
        ["sign", "verify"]
    );
}

/** Exports a public CryptoKey to a DID did:key string (hex-encoded representation). */
export async function exportKeyToDID(publicKey: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("spki", publicKey);
    const hex = Array.from(new Uint8Array(exported))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `did:key:z${hex}`;
}

/** Imports a SPKI hex-encoded public key back into a CryptoKey instance. */
export async function importDIDToKey(did: string): Promise<CryptoKey> {
    const hex = did.replace(/^did:key:z/, "");
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    return crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        {
            name: "ECDSA",
            namedCurve: "P-256",
        },
        false,
        ["verify"]
    );
}

/** Signs content string using a private key. Returns hex signature. */
export async function signPayload(privateKey: CryptoKey, content: string): Promise<string> {
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
        {
            name: "ECDSA",
            hash: { name: "SHA-256" },
        },
        privateKey,
        encoder.encode(content)
    );
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** Verifies a payload signature using a DID public key string. */
export async function verifyPayload(did: string, signature: string, content: string): Promise<boolean> {
    try {
        const publicKey = await importDIDToKey(did);
        const encoder = new TextEncoder();
        const sigBytes = new Uint8Array(
            signature.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
        );
        return crypto.subtle.verify(
            {
                name: "ECDSA",
                hash: { name: "SHA-256" },
            },
            publicKey,
            sigBytes,
            encoder.encode(content)
        );
    } catch (err) {
        console.warn("[Identity] Verification failed:", err);
        return false;
    }
}
