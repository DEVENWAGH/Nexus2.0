"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DB_NAME = "nexus-offline-messages";
const DB_VERSION = 2;
const STORE = "messages";

/** How often the watchdog polls for expired messages (60 seconds) */
const PURGE_INTERVAL_MS = 60_000;

/** 24-hour TTL in milliseconds */
const TTL_MS = 24 * 60 * 60 * 1_000;

// ── IndexedDB helpers ─────────────────────────────────────────────────────

async function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("channelId", "channelId", { unique: false });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("expiresAt", "expiresAt", { unique: false });
      } else {
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

async function purgeExpiredMessages(): Promise<number> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const now = Date.now();
    let purgedCount = 0;
    const tx = db.transaction(STORE, "readwrite");
    const index = tx.objectStore(STORE).index("expiresAt");
    const range = IDBKeyRange.upperBound(now, false);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        purgedCount++;
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve(purgedCount);
    tx.onerror = () => reject(tx.error);
  });
}

async function countExpiredMessages(): Promise<number> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("expiresAt");
    const range = IDBKeyRange.upperBound(now, false);
    const req = index.count(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function countAllLocalMessages(): Promise<number> {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Main hook ─────────────────────────────────────────────────────────────

export type SelfDestructStats = {
  localMessageCount: number;
  lastPurgeCount: number;
  lastPurgeAt: Date | null;
  nextPurgeAt: Date | null;
};

/**
 * useSelfDestruct — Client-side 24-hour TTL watchdog.
 *
 * Runs a periodic purge of expired IndexedDB messages every 60 seconds.
 * Works independently of the server-side cron job, providing dual-layer
 * self-destruct coverage at 50% decentralization (server + client).
 */
export function useSelfDestruct() {
  const [stats, setStats] = useState<SelfDestructStats>({
    localMessageCount: 0,
    lastPurgeCount: 0,
    lastPurgeAt: null,
    nextPurgeAt: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runPurge = useCallback(async () => {
    try {
      const count = await purgeExpiredMessages();
      const localMessageCount = await countAllLocalMessages();
      const now = new Date();
      setStats({
        localMessageCount,
        lastPurgeCount: count,
        lastPurgeAt: now,
        nextPurgeAt: new Date(now.getTime() + PURGE_INTERVAL_MS),
      });
      if (count > 0) {
        console.log(`[SelfDestruct] Purged ${count} expired messages from IndexedDB`);
      }
    } catch (err) {
      console.error("[SelfDestruct] Purge error:", err);
    }
  }, []);

  useEffect(() => {
    // Run immediately on mount
    void runPurge();

    // Schedule recurring purge
    intervalRef.current = setInterval(() => void runPurge(), PURGE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runPurge]);

  /** Manually trigger an immediate purge (e.g., from admin dashboard) */
  const triggerManualPurge = useCallback(async () => {
    await runPurge();
  }, [runPurge]);

  /** Return the TTL in ms (24 hours) */
  const ttlMs = TTL_MS;

  /** Countdown in ms until next scheduled purge */
  const msUntilNextPurge = stats.nextPurgeAt
    ? Math.max(0, stats.nextPurgeAt.getTime() - Date.now())
    : PURGE_INTERVAL_MS;

  return {
    ...stats,
    triggerManualPurge,
    ttlMs,
    msUntilNextPurge,
  };
}
