"use client";

import { useEffect, useCallback, useRef } from "react";
import { generateDIDKeyPair, exportKeyToDID, signPayload, verifyPayload } from "@repo/p2p";

const DB_NAME = "nexus-identity";
const DB_VERSION = 1;
const STORE_NAME = "did-keys";

export type IdentityProfile = {
    did: string;
    createdAt: number;
};

// ── IndexedDB helpers ──────────────────────────────────────────────────────

async function openIdentityDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        req.onerror = () => reject(req.error);
    });
}

async function loadKeys(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey } | null> {
    const db = await openIdentityDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get("primary");
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function saveKeys(publicJwk: JsonWebKey, privateJwk: JsonWebKey): Promise<void> {
    const db = await openIdentityDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id: "primary", publicJwk, privateJwk });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ── Main hook ──────────────────────────────────────────────────────────────

let _identityCache: {
    did: string;
    publicKey: CryptoKey;
    privateKey: CryptoKey;
} | null = null;

export async function getOrCreateIdentity(): Promise<{ did: string; publicKey: CryptoKey; privateKey: CryptoKey }> {
    if (_identityCache) return _identityCache;

    const stored = await loadKeys();
    if (stored) {
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            stored.publicJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
        );
        const privateKey = await crypto.subtle.importKey(
            "jwk",
            stored.privateJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign"]
        );
        const did = await exportKeyToDID(publicKey);
        _identityCache = { did, publicKey, privateKey };
        return _identityCache;
    }

    // Generate fresh DID key pair
    const { publicKey, privateKey } = await generateDIDKeyPair();
    const did = await exportKeyToDID(publicKey);

    const publicJwk = await crypto.subtle.exportKey("jwk", publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
    await saveKeys(publicJwk, privateJwk);

    _identityCache = { did, publicKey, privateKey };
    return _identityCache;
}

export function useIdentity() {
    const identity = useRef<Awaited<ReturnType<typeof getOrCreateIdentity>> | null>(null);

    useEffect(() => {
        getOrCreateIdentity().then((id) => {
            identity.current = id;
        });
    }, []);

    const sign = useCallback(async (content: string): Promise<{ did: string; signature: string } | null> => {
        if (!identity.current) {
            try {
                identity.current = await getOrCreateIdentity();
            } catch {
                return null;
            }
        }
        const signature = await signPayload(identity.current.privateKey, content);
        return { did: identity.current.did, signature };
    }, []);

    const verify = useCallback(async (did: string, signature: string, content: string): Promise<boolean> => {
        return verifyPayload(did, signature, content);
    }, []);

    const getDID = useCallback(async (): Promise<string> => {
        if (identity.current) return identity.current.did;
        identity.current = await getOrCreateIdentity();
        return identity.current.did;
    }, []);

    return { sign, verify, getDID };
}
