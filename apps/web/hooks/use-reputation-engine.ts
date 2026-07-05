"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type PeerReputation = {
    peerId: string;
    score: number;           // 0–100
    messagesExchanged: number;
    verifiedSignatures: number;
    failedSignatures: number;
    latencyAvgMs: number;
    firstSeen: number;
    lastSeen: number;
    blacklisted: boolean;
    blacklistReason?: string;
    trustLevel: "trusted" | "neutral" | "suspicious" | "blacklisted";
};

type ReputationEvent =
    | { type: "message_received"; peerId: string; latencyMs?: number }
    | { type: "signature_verified"; peerId: string }
    | { type: "signature_failed"; peerId: string }
    | { type: "handshake_success"; peerId: string; latencyMs: number }
    | { type: "connection_dropped"; peerId: string }
    | { type: "suspicious_payload"; peerId: string; reason: string };

const DB_NAME = "nexus-reputation";
const DB_VERSION = 1;
const STORE = "peers";

async function openReputationDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "peerId" });
            }
        };
        req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
        req.onerror = () => reject(req.error);
    });
}

async function loadAllReputation(): Promise<Map<string, PeerReputation>> {
    const db = await openReputationDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
            const map = new Map<string, PeerReputation>();
            (req.result as PeerReputation[]).forEach((p) => map.set(p.peerId, p));
            resolve(map);
        };
        req.onerror = () => reject(req.error);
    });
}

async function persistPeer(peer: PeerReputation): Promise<void> {
    const db = await openReputationDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(peer);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function computeTrustLevel(rep: PeerReputation): PeerReputation["trustLevel"] {
    if (rep.blacklisted) return "blacklisted";
    if (rep.score >= 70) return "trusted";
    if (rep.score >= 40) return "neutral";
    return "suspicious";
}

function computeScore(rep: PeerReputation): number {
    let score = 50; // Baseline
    score += Math.min(rep.verifiedSignatures * 2, 20);
    score -= Math.min(rep.failedSignatures * 10, 40);
    score -= Math.min(Math.max(0, (rep.latencyAvgMs - 100) / 10), 20);
    score += Math.min(Math.floor(rep.messagesExchanged / 5), 10);
    return Math.max(0, Math.min(100, Math.round(score)));
}

export function useReputationEngine() {
    const [reputations, setReputations] = useState<Map<string, PeerReputation>>(new Map());
    const dbLoaded = useRef(false);

    useEffect(() => {
        loadAllReputation().then((map) => {
            setReputations(map);
            dbLoaded.current = true;
        });
    }, []);

    const updateReputation = useCallback(async (event: ReputationEvent) => {
        const { peerId } = event;

        setReputations((prev) => {
            const existing = prev.get(peerId) ?? {
                peerId,
                score: 50,
                messagesExchanged: 0,
                verifiedSignatures: 0,
                failedSignatures: 0,
                latencyAvgMs: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                blacklisted: false,
                trustLevel: "neutral" as const,
            };

            const updated = { ...existing, lastSeen: Date.now() };

            switch (event.type) {
                case "message_received":
                    updated.messagesExchanged++;
                    if (event.latencyMs !== undefined) {
                        updated.latencyAvgMs = updated.latencyAvgMs === 0
                            ? event.latencyMs
                            : Math.round((updated.latencyAvgMs * 0.8) + (event.latencyMs * 0.2));
                    }
                    break;
                case "signature_verified":
                    updated.verifiedSignatures++;
                    break;
                case "signature_failed":
                    updated.failedSignatures++;
                    break;
                case "handshake_success":
                    updated.latencyAvgMs = event.latencyMs;
                    break;
                case "connection_dropped":
                    updated.score = Math.max(0, updated.score - 5);
                    break;
                case "suspicious_payload":
                    updated.failedSignatures += 2;
                    if (updated.failedSignatures >= 5) {
                        updated.blacklisted = true;
                        updated.blacklistReason = event.reason;
                    }
                    break;
            }

            updated.score = computeScore(updated);
            updated.trustLevel = computeTrustLevel(updated);

            const next = new Map(prev);
            next.set(peerId, updated);

            // Persist to IndexedDB asynchronously
            void persistPeer(updated);

            return next;
        });
    }, []);

    const blacklistPeer = useCallback(async (peerId: string, reason: string) => {
        setReputations((prev) => {
            const existing = prev.get(peerId);
            if (!existing) return prev;
            const updated: PeerReputation = {
                ...existing,
                blacklisted: true,
                blacklistReason: reason,
                score: 0,
                trustLevel: "blacklisted",
            };
            const next = new Map(prev);
            next.set(peerId, updated);
            void persistPeer(updated);
            return next;
        });
    }, []);

    const getReputation = useCallback((peerId: string): PeerReputation | null => {
        return reputations.get(peerId) ?? null;
    }, [reputations]);

    const isBlacklisted = useCallback((peerId: string): boolean => {
        return reputations.get(peerId)?.blacklisted ?? false;
    }, [reputations]);

    return {
        reputations,
        updateReputation,
        blacklistPeer,
        getReputation,
        isBlacklisted,
    };
}
