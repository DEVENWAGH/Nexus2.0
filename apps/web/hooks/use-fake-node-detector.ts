"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { verifyPayload } from "@repo/p2p";
import { evaluateContentRules } from "@/lib/content-rules";
import { scanText } from "@/lib/client-content-scan";

export type FakeNodeAlert = {
    id: string;
    peerId: string;
    reason: string;
    severity: "warning" | "critical";
    timestamp: number;
    dismissed: boolean;
    source?: "rules" | "onnx" | "rules+onnx";
    score?: number;
};

type FakeNodeDetectorOptions = {
    onBlacklist?: (peerId: string, reason: string) => void;
};

export function useFakeNodeDetector(options: FakeNodeDetectorOptions = {}) {
    const [alerts, setAlerts] = useState<FakeNodeAlert[]>([]);
    const blacklistedPeers = useRef<Set<string>>(new Set());
    const signaturesPerPeer = useRef<Map<string, { total: number; failed: number }>>(new Map());

    const addAlert = useCallback(
        (
            peerId: string,
            reason: string,
            severity: FakeNodeAlert["severity"],
            meta?: Pick<FakeNodeAlert, "source" | "score">,
        ) => {
            const alert: FakeNodeAlert = {
                id: `${peerId}-${Date.now()}`,
                peerId,
                reason,
                severity,
                timestamp: Date.now(),
                dismissed: false,
                source: meta?.source,
                score: meta?.score,
            };
            setAlerts((prev) => [alert, ...prev.slice(0, 49)]);

            if (severity === "critical" && !blacklistedPeers.current.has(peerId)) {
                blacklistedPeers.current.add(peerId);
                options.onBlacklist?.(peerId, reason);
            }
        },
        [options]
    );

    const inspectMessage = useCallback(
        async (
            peerId: string,
            content: string,
            did?: string,
            signature?: string,
            messageId?: string,
        ): Promise<boolean> => {
            if (blacklistedPeers.current.has(peerId)) return false;

            const rules = evaluateContentRules(content);
            if (rules.suspicious) {
                addAlert(peerId, rules.reasons.join("; "), "warning", { source: "rules" });
            }

            const ai = await scanText(content);
            if (ai.suspicious) {
                addAlert(
                    peerId,
                    ai.reasons.join("; "),
                    ai.label === "malicious" ? "critical" : "warning",
                    { source: ai.source, score: ai.score },
                );
            }

            if (did && signature) {
                const statsEntry = signaturesPerPeer.current.get(peerId) ?? { total: 0, failed: 0 };
                statsEntry.total++;

                try {
                    const signedPayload = messageId ? `${messageId}|${content}` : content;
                    const isValid = await verifyPayload(did, signature, signedPayload);
                    if (!isValid) {
                        statsEntry.failed++;
                        signaturesPerPeer.current.set(peerId, statsEntry);
                        addAlert(peerId, `DID signature verification failed (${statsEntry.failed}/${statsEntry.total} failed)`, "warning");

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
