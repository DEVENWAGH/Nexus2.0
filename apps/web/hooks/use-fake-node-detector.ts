"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { verifyPayload } from "@repo/p2p";

export type FakeNodeAlert = {
    id: string;
    peerId: string;
    reason: string;
    severity: "warning" | "critical";
    timestamp: number;
    dismissed: boolean;
};

type FakeNodeDetectorOptions = {
    onBlacklist?: (peerId: string, reason: string) => void;
};

// ── Heuristic checks ─────────────────────────────────────────────────────

function detectSuspiciousPatterns(content: string): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Injection patterns
    if (/\b(exec|eval|base64_decode|system|shell_exec)\b/i.test(content)) {
        reasons.push("Potential code injection payload detected");
    }
    // Abnormally large payloads (> 64KB of text)
    if (content.length > 65536) {
        reasons.push("Oversized message payload (potential flood attack)");
    }
    // Repetitive patterns (DoS flooding marker)
    if (/(.)\1{100,}/.test(content)) {
        reasons.push("Repetitive pattern detected (potential DoS flooding)");
    }

    return { suspicious: reasons.length > 0, reasons };
}

// ── Main hook ─────────────────────────────────────────────────────────────

export function useFakeNodeDetector(options: FakeNodeDetectorOptions = {}) {
    const [alerts, setAlerts] = useState<FakeNodeAlert[]>([]);
    const blacklistedPeers = useRef<Set<string>>(new Set());
    const signaturesPerPeer = useRef<Map<string, { total: number; failed: number }>>(new Map());

    const addAlert = useCallback(
        (peerId: string, reason: string, severity: FakeNodeAlert["severity"]) => {
            const alert: FakeNodeAlert = {
                id: `${peerId}-${Date.now()}`,
                peerId,
                reason,
                severity,
                timestamp: Date.now(),
                dismissed: false,
            };
            setAlerts((prev) => [alert, ...prev.slice(0, 49)]); // Max 50 alerts

            // Auto-blacklist on critical alerts
            if (severity === "critical" && !blacklistedPeers.current.has(peerId)) {
                blacklistedPeers.current.add(peerId);
                options.onBlacklist?.(peerId, reason);
            }
        },
        [options]
    );

    const inspectMessage = useCallback(
        async (peerId: string, content: string, did?: string, signature?: string): Promise<boolean> => {
            // Already blacklisted
            if (blacklistedPeers.current.has(peerId)) return false;

            // 1. Content heuristics check
            const { suspicious, reasons } = detectSuspiciousPatterns(content);
            if (suspicious) {
                addAlert(peerId, reasons.join("; "), "warning");
                const stats = signaturesPerPeer.current.get(peerId) ?? { total: 0, failed: 0 };
                stats.failed++;
                signaturesPerPeer.current.set(peerId, stats);
            }

            // 2. DID signature verification
            if (did && signature) {
                const statsEntry = signaturesPerPeer.current.get(peerId) ?? { total: 0, failed: 0 };
                statsEntry.total++;

                try {
                    const isValid = await verifyPayload(did, signature, content);
                    if (!isValid) {
                        statsEntry.failed++;
                        signaturesPerPeer.current.set(peerId, statsEntry);
                        addAlert(peerId, `DID signature verification failed (${statsEntry.failed}/${statsEntry.total} failed)`, "warning");

                        // Escalate to critical after 3 consecutive failures
                        if (statsEntry.failed >= 3) {
                            addAlert(peerId, "Critical: Repeated DID signature failures — peer may be impersonating another node", "critical");
                            return false;
                        }
                    } else {
                        signaturesPerPeer.current.set(peerId, statsEntry);
                    }
                } catch {
                    addAlert(peerId, "DID signature check errored — possible malformed key", "warning");
                }
            }

            return !blacklistedPeers.current.has(peerId);
        },
        [addAlert]
    );

    const isBlacklisted = useCallback((peerId: string) => {
        return blacklistedPeers.current.has(peerId);
    }, []);

    const dismissAlert = useCallback((alertId: string) => {
        setAlerts((prev) =>
            prev.map((a) => (a.id === alertId ? { ...a, dismissed: true } : a))
        );
    }, []);

    const clearBlacklist = useCallback((peerId: string) => {
        blacklistedPeers.current.delete(peerId);
    }, []);

    const activeAlerts = alerts.filter((a) => !a.dismissed);

    return {
        alerts,
        activeAlerts,
        isBlacklisted,
        inspectMessage,
        dismissAlert,
        clearBlacklist,
        blacklistedPeers: blacklistedPeers.current,
    };
}
