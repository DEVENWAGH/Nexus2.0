"use client";

import { useEffect, useState } from "react";
import { useP2PChatContext } from "@/components/chat/p2p-chat-bridge";

export type PeerStatsReport = {
    peerId: string;
    rtt: number;
    bytesSent: number;
    bytesReceived: number;
    packetsLost: number;
    candidateType: string;
    connectionState: string;
    uploadSpeed: number; // bytes/sec
    downloadSpeed: number; // bytes/sec
};

export function useRTCPeerStats(intervalMs = 2000) {
    const { mesh, isReady } = useP2PChatContext();
    const [peerStats, setPeerStats] = useState<Record<string, PeerStatsReport>>({});
    const [prevStats, setPrevStats] = useState<Record<string, { sent: number; received: number; time: number }>>({});

    useEffect(() => {
        if (!isReady || !mesh) {
            setPeerStats({});
            return;
        }

        const fetchStats = async () => {
            const raw = await mesh.getPeerStats();
            const now = Date.now();
            const reports: Record<string, PeerStatsReport> = {};
            const nextPrev: typeof prevStats = {};

            Object.entries(raw).forEach(([peerId, data]: [string, any]) => {
                const prev = prevStats[peerId];
                let uploadSpeed = 0;
                let downloadSpeed = 0;

                if (prev) {
                    const timeDiffSec = (now - prev.time) / 1000;
                    if (timeDiffSec > 0) {
                        uploadSpeed = Math.max(0, (data.bytesSent - prev.sent) / timeDiffSec);
                        downloadSpeed = Math.max(0, (data.bytesReceived - prev.received) / timeDiffSec);
                    }
                }

                reports[peerId] = {
                    peerId,
                    rtt: data.rtt,
                    bytesSent: data.bytesSent,
                    bytesReceived: data.bytesReceived,
                    packetsLost: data.packetsLost,
                    candidateType: data.candidateType,
                    connectionState: data.connectionState,
                    uploadSpeed,
                    downloadSpeed,
                };

                nextPrev[peerId] = {
                    sent: data.bytesSent,
                    received: data.bytesReceived,
                    time: now,
                };
            });

            setPeerStats(reports);
            setPrevStats(nextPrev);
        };

        const timer = setInterval(fetchStats, intervalMs);
        void fetchStats();

        return () => clearInterval(timer);
    }, [mesh, isReady, intervalMs, prevStats]);

    return peerStats;
}
