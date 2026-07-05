"use client";

import { useEffect, useCallback, useRef } from "react";

const DB_NAME = "nexus-offline-messages";
/** Bump version so the upgrade handler runs and adds the expiresAt index */
const DB_VERSION = 2;
const STORE = "messages";

/** 24 hours in milliseconds – messages self-destruct after this window */
const TTL_MS = 24 * 60 * 60 * 1000;

export type CachedMessage = {
    id: string;
    channelId: string;
    content: string;
    authorId: string;
    timestamp: number;
    /** Unix-ms timestamp at which this message should be purged from local cache */
    expiresAt: number;
    vectorClock: Record<string, number>;
    synced: boolean;
};

// ── IndexedDB helpers ─────────────────────────────────────────────────────

async function openOfflineDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            // v1 → create base store
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "id" });
                store.createIndex("channelId", "channelId", { unique: false });
                store.createIndex("synced", "synced", { unique: false });
                store.createIndex("expiresAt", "expiresAt", { unique: false });
            } else {
                // v2 upgrade → add expiresAt index if missing
                const store = (e.target as IDBOpenDBRequest).transaction!.objectStore(STORE);
                if (!store.indexNames.contains("expiresAt")) {
                    store.createIndex("expiresAt", "expiresAt", { unique: false });
                }
            }
        };
        req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        req.onerror = () => reject(req.error);
    });
}

/** Remove all messages whose expiresAt is in the past */
async function purgeExpiredMessages(): Promise<void> {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const now = Date.now();
        const tx = db.transaction(STORE, "readwrite");
        const index = tx.objectStore(STORE).index("expiresAt");
        // All keys from 0 up to (but not including) now are expired
        const range = IDBKeyRange.upperBound(now, false);
        const req = index.openCursor(range);
        req.onsuccess = () => {
            const cursor = req.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function saveMessage(msg: CachedMessage): Promise<void> {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(msg);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadChannelMessages(channelId: string): Promise<CachedMessage[]> {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const index = tx.objectStore(STORE).index("channelId");
        const req = index.getAll(channelId);
        req.onsuccess = () => {
            const now = Date.now();
            // Filter out any expired messages from the result
            const live = (req.result as CachedMessage[]).filter((m) => m.expiresAt > now);
            resolve(live);
        };
        req.onerror = () => reject(req.error);
    });
}

async function loadUnsynced(): Promise<CachedMessage[]> {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const index = tx.objectStore(STORE).index("synced");
        // IDB stores booleans as numbers: false → 0, true → 1
        // IDBKeyRange.only(0) correctly queries the unsynced (false) entries
        const req = index.getAll(IDBKeyRange.only(0));
        req.onsuccess = () => {
            const now = Date.now();
            // Only return non-expired unsynced messages
            const live = (req.result as CachedMessage[]).filter((m) => m.expiresAt > now);
            resolve(live);
        };
        req.onerror = () => reject(req.error);
    });
}

async function markSynced(id: string): Promise<void> {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.get(id);
        req.onsuccess = () => {
            const msg = req.result;
            if (msg) {
                msg.synced = true;
                store.put(msg);
            }
            resolve();
        };
        req.onerror = () => reject(req.error);
    });
}

// ── Vector Clock ─────────────────────────────────────────────────────────

function mergeVectorClocks(
    a: Record<string, number>,
    b: Record<string, number>
): Record<string, number> {
    const merged: Record<string, number> = { ...a };
    for (const [nodeId, tick] of Object.entries(b)) {
        merged[nodeId] = Math.max(merged[nodeId] ?? 0, tick);
    }
    return merged;
}

function incrementClock(clock: Record<string, number>, nodeId: string): Record<string, number> {
    return { ...clock, [nodeId]: (clock[nodeId] ?? 0) + 1 };
}

// ── Main hook ─────────────────────────────────────────────────────────────

export function useOfflineSync(channelId: string, nodeId: string) {
    const clockRef = useRef<Record<string, number>>({});

    useEffect(() => {
        // Purge expired messages once on mount, then load the clock
        purgeExpiredMessages()
            .then(() => loadChannelMessages(channelId))
            .then((msgs) => {
                if (msgs.length > 0) {
                    const merged = msgs.reduce(
                        (acc, msg) => mergeVectorClocks(acc, msg.vectorClock),
                        {} as Record<string, number>
                    );
                    clockRef.current = merged;
                }
            })
            .catch(console.error);

        // Schedule periodic purge every hour while the component is mounted
        const intervalId = setInterval(() => {
            purgeExpiredMessages().catch(console.error);
        }, 60 * 60 * 1000);

        return () => clearInterval(intervalId);
    }, [channelId]);

    const cacheMessage = useCallback(
        async (message: Omit<CachedMessage, "vectorClock" | "synced" | "expiresAt">) => {
            clockRef.current = incrementClock(clockRef.current, nodeId);
            const cached: CachedMessage = {
                ...message,
                expiresAt: Date.now() + TTL_MS,
                vectorClock: { ...clockRef.current },
                synced: navigator.onLine,
            };
            await saveMessage(cached);
            return cached;
        },
        [nodeId]
    );

    const reconcile = useCallback(
        async (incomingMessages: CachedMessage[]): Promise<CachedMessage[]> => {
            const local = await loadChannelMessages(channelId);
            const localIds = new Set(local.map((m) => m.id));
            const newMessages: CachedMessage[] = [];

            for (const incoming of incomingMessages) {
                if (!localIds.has(incoming.id)) {
                    clockRef.current = mergeVectorClocks(clockRef.current, incoming.vectorClock);
                    await saveMessage({
                        ...incoming,
                        // Preserve server-set expiresAt; fall back to TTL if missing
                        expiresAt: incoming.expiresAt ?? Date.now() + TTL_MS,
                        synced: true,
                    });
                    newMessages.push(incoming);
                }
            }

            return newMessages;
        },
        [channelId]
    );

    const syncPending = useCallback(async () => {
        if (!navigator.onLine) return [];
        const unsynced = await loadUnsynced();
        for (const msg of unsynced) {
            await markSynced(msg.id);
        }
        return unsynced;
    }, []);

    const getLocalMessages = useCallback(async (): Promise<CachedMessage[]> => {
        return loadChannelMessages(channelId);
    }, [channelId]);

    /** Manually trigger a purge of all expired cached messages */
    const purgeExpired = useCallback(async () => {
        await purgeExpiredMessages();
    }, []);

    return {
        cacheMessage,
        reconcile,
        syncPending,
        getLocalMessages,
        purgeExpired,
        currentClock: clockRef.current,
    };
}
