import { encryptMessage, decryptMessage } from "./encryption";
import { SignalingClient } from "./signaling-client";
import {
    computeBufferHash,
    getFileChunk,
    FileReassemblyBuffer,
    type FileMetadata,
    type FileChunkPayload,
} from "./file-transfer";
import type {
    P2PChatMessage,
    P2PMeshEvents,
    PeerInfo,
    SignalPayload,
    SignalingServerMessage,
} from "./types";

export type P2PMeshOptions = {
    signalingUrl: string;
    roomId: string;
    peerId: string;
    userId?: string;
    /** When true, payloads on the wire are AES-GCM encrypted with roomId as channel key */
    encrypt?: boolean;
    iceServers?: RTCIceServer[];
};

type PeerConnection = {
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
};

const DEFAULT_ICE: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
];

export class P2PMesh {
    private readonly options: P2PMeshOptions;
    private signaling: SignalingClient | null = null;
    private peers = new Map<string, PeerConnection>();
    private listeners = new Map<keyof P2PMeshEvents, Set<P2PMeshEvents[keyof P2PMeshEvents]>>();
    private joined = false;
    private fileBuffers = new Map<string, FileReassemblyBuffer>();
    private activeTransfers = new Map<
        string,
        {
            file: File;
            resolve: () => void;
            reject: (err: any) => void;
            onAck: (index: number, fromPeerId: string) => void;
        }
    >();

    constructor(options: P2PMeshOptions) {
        this.options = {
            encrypt: true,
            iceServers: DEFAULT_ICE,
            ...options,
        };
    }

    on<K extends keyof P2PMeshEvents>(event: K, handler: P2PMeshEvents[K]): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler as P2PMeshEvents[keyof P2PMeshEvents]);
        return () => this.listeners.get(event)?.delete(handler as P2PMeshEvents[keyof P2PMeshEvents]);
    }

    private emit<K extends keyof P2PMeshEvents>(
        event: K,
        ...args: Parameters<P2PMeshEvents[K]>
    ): void {
        for (const handler of this.listeners.get(event) ?? []) {
            (handler as (...a: Parameters<P2PMeshEvents[K]>) => void)(...args);
        }
    }

    async join(): Promise<void> {
        if (this.joined) return;

        this.signaling = new SignalingClient({
            url: this.options.signalingUrl,
            onMessage: (msg) => this.handleSignaling(msg),
            onError: () =>
                this.emit("error", new Error("Signaling connection failed")),
        });

        await this.signaling.connectAsync();

        this.signaling.send({
            type: "join",
            roomId: this.options.roomId,
            peerId: this.options.peerId,
            userId: this.options.userId,
        });
        this.joined = true;
    }

    async send(content: string, id?: string): Promise<void> {
        const message: P2PChatMessage = {
            id: id || crypto.randomUUID(),
            fromPeerId: this.options.peerId,
            fromUserId: this.options.userId,
            content,
            encrypted: Boolean(this.options.encrypt),
            timestamp: Date.now(),
        };

        let wirePayload: string;
        if (this.options.encrypt) {
            wirePayload = await encryptMessage(JSON.stringify(message), this.options.roomId);
        } else {
            wirePayload = JSON.stringify(message);
        }

        const envelope = JSON.stringify({ kind: "chat", payload: wirePayload });

        // Echo to self for UI consistency
        this.emit("message", message);

        for (const [, conn] of this.peers) {
            if (conn.dc?.readyState === "open") {
                conn.dc.send(envelope);
            }
        }
    }

    async sendFile(
        file: File,
        fileId: string = crypto.randomUUID(),
        onProgress?: (progress: number) => void,
    ): Promise<string> {
        const chunkSize = 32768; // 32KBsafe WebRTC chunk size
        const totalChunks = Math.ceil(file.size / chunkSize);

        const entireBuffer = await file.arrayBuffer();
        const fileHash = await computeBufferHash(entireBuffer);

        const metadata: FileMetadata = {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type || "application/octet-stream",
            totalChunks,
            hash: fileHash,
        };

        // Send metadata to all peers
        const metaEnvelope = JSON.stringify({
            kind: "file_metadata",
            payload: JSON.stringify(metadata),
        });
        
        for (const [, conn] of this.peers) {
            if (conn.dc?.readyState === "open") {
                conn.dc.send(metaEnvelope);
            }
        }

        for (let i = 0; i < totalChunks; i++) {
            const { buffer } = await getFileChunk(file, i, chunkSize);
            const chunkHash = await computeBufferHash(buffer);

            // Convert ArrayBuffer to base64
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let b = 0; b < bytes.byteLength; b++) {
                binary += String.fromCharCode(bytes[b]);
            }
            const base64Data = btoa(binary);

            const chunkPayload: FileChunkPayload = {
                fileId,
                index: i,
                data: base64Data,
                hash: chunkHash,
            };

            const chunkEnvelope = JSON.stringify({
                kind: "file_chunk",
                payload: JSON.stringify(chunkPayload),
            });

            // Track active peers for this chunk
            const activePeerIds = new Set<string>();
            for (const [peerId, conn] of this.peers) {
                if (conn.dc?.readyState === "open") {
                    activePeerIds.add(peerId);
                }
            }

            if (activePeerIds.size > 0) {
                const receivedFrom = new Set<string>();
                let resolveAck: () => void;
                const ackPromise = new Promise<void>((resolve) => {
                    resolveAck = resolve;
                });

                this.activeTransfers.set(fileId, {
                    file,
                    resolve: () => {},
                    reject: () => {},
                    onAck: (index: number, fromPeerId: string) => {
                        if (index === i) {
                            receivedFrom.add(fromPeerId);
                            // Filter active peer IDs by currently open data channels
                            const stillActivePeers = [...activePeerIds].filter(pid =>
                                this.peers.get(pid)?.dc?.readyState === "open"
                            );
                            const hasAllAcks = stillActivePeers.every(pid => receivedFrom.has(pid));
                            if (hasAllAcks) {
                                resolveAck();
                            }
                        }
                    }
                });

                // Send the chunk to all active peers
                for (const peerId of activePeerIds) {
                    const conn = this.peers.get(peerId);
                    if (conn?.dc?.readyState === "open") {
                        conn.dc.send(chunkEnvelope);
                    }
                }

                // Wait for all ACKs or 3s fallback timeout
                await Promise.race([
                    ackPromise,
                    new Promise((resolve) => setTimeout(resolve, 3000)),
                ]);
            }

            onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
        }

        this.activeTransfers.delete(fileId);
        return fileId;
    }

    leave(): void {
        for (const [peerId, conn] of this.peers) {
            conn.dc?.close();
            conn.pc.close();
            this.peers.delete(peerId);
        }

        if (this.signaling?.connected) {
            this.signaling.send({
                type: "leave",
                roomId: this.options.roomId,
                peerId: this.options.peerId,
            });
        }
        this.signaling?.disconnect();
        this.signaling = null;
        this.joined = false;
    }

    get connectedPeerCount(): number {
        return [...this.peers.values()].filter((p) => p.dc?.readyState === "open")
            .length;
    }

    async getPeerStats(): Promise<Record<string, any>> {
        const stats: Record<string, any> = {};
        for (const [peerId, conn] of this.peers) {
            if (!conn.pc) continue;
            try {
                const reports = await conn.pc.getStats();
                let rtt = 0;
                let bytesSent = 0;
                let bytesReceived = 0;
                let packetsLost = 0;
                let candidateType = "unknown";

                reports.forEach((report) => {
                    if (report.type === "candidate-pair" && report.state === "succeeded") {
                        rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0; // ms
                    }
                    if (report.type === "outbound-rtp") {
                        bytesSent += report.bytesSent ?? 0;
                    }
                    if (report.type === "inbound-rtp") {
                        bytesReceived += report.bytesReceived ?? 0;
                        packetsLost += report.packetsLost ?? 0;
                    }
                    if (report.type === "local-candidate") {
                        candidateType = report.candidateType ?? "unknown";
                    }
                });

                stats[peerId] = {
                    rtt,
                    bytesSent,
                    bytesReceived,
                    packetsLost,
                    candidateType,
                    connectionState: conn.pc.connectionState,
                };
            } catch (err) {
                console.warn(`Failed to get stats for peer ${peerId}:`, err);
            }
        }
        return stats;
    }

    private handleSignaling(message: SignalingServerMessage): void {
        switch (message.type) {
            case "joined":
                this.emit("room-joined", message.peers);
                for (const peer of message.peers) {
                    if (peer.peerId !== this.options.peerId) {
                        void this.connectToPeer(peer.peerId);
                    }
                }
                break;
            case "peer-joined":
                if (message.peerId !== this.options.peerId) {
                    void this.connectToPeer(message.peerId);
                }
                break;
            case "peer-left":
                this.removePeer(message.peerId);
                break;
            case "signal":
                void this.handleSignal(message.fromPeerId, message.payload);
                break;
            case "error":
                this.emit("error", new Error(message.message));
                break;
        }
    }

    /** Lower peerId initiates offer to avoid glare */
    private shouldInitiate(remotePeerId: string): boolean {
        return this.options.peerId < remotePeerId;
    }

    private async connectToPeer(remotePeerId: string): Promise<void> {
        if (this.peers.has(remotePeerId)) return;

        const pc = this.createPeerConnection(remotePeerId);
        this.peers.set(remotePeerId, { pc, dc: null });

        if (this.shouldInitiate(remotePeerId)) {
            const dc = pc.createDataChannel("chat", { ordered: true });
            this.attachDataChannel(remotePeerId, dc);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signaling?.send({
                type: "signal",
                roomId: this.options.roomId,
                toPeerId: remotePeerId,
                payload: { kind: "offer", sdp: offer },
            });
        }
    }

    private createPeerConnection(remotePeerId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection({ iceServers: this.options.iceServers });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling?.send({
                    type: "signal",
                    roomId: this.options.roomId,
                    toPeerId: remotePeerId,
                    payload: { kind: "ice", candidate: event.candidate.toJSON() },
                });
            }
        };

        pc.ondatachannel = (event) => {
            this.attachDataChannel(remotePeerId, event.channel);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                this.emit("peer-connected", remotePeerId);
            }
            if (
                pc.connectionState === "failed" ||
                pc.connectionState === "closed" ||
                pc.connectionState === "disconnected"
            ) {
                this.removePeer(remotePeerId);
            }
        };

        return pc;
    }

    private attachDataChannel(remotePeerId: string, dc: RTCDataChannel): void {
        const entry = this.peers.get(remotePeerId);
        if (entry) {
            entry.dc = dc;
        }

        dc.onopen = () => this.emit("peer-connected", remotePeerId);
        dc.onclose = () => this.removePeer(remotePeerId);
        dc.onmessage = (event) => void this.handleDataMessage(String(event.data), remotePeerId);
    }

    private async handleSignal(
        fromPeerId: string,
        payload: SignalPayload,
    ): Promise<void> {
        let entry = this.peers.get(fromPeerId);

        if (payload.kind === "offer") {
            if (!entry) {
                const pc = this.createPeerConnection(fromPeerId);
                entry = { pc, dc: null };
                this.peers.set(fromPeerId, entry);
            }
            await entry.pc.setRemoteDescription(payload.sdp);
            const answer = await entry.pc.createAnswer();
            await entry.pc.setLocalDescription(answer);
            this.signaling?.send({
                type: "signal",
                roomId: this.options.roomId,
                toPeerId: fromPeerId,
                payload: { kind: "answer", sdp: answer },
            });
            return;
        }

        if (!entry) return;

        if (payload.kind === "answer") {
            await entry.pc.setRemoteDescription(payload.sdp);
        } else if (payload.kind === "ice") {
            await entry.pc.addIceCandidate(payload.candidate);
        }
    }

    private async handleDataMessage(raw: string, fromPeerId: string): Promise<void> {
        try {
            const envelope = JSON.parse(raw) as { kind: string; payload: string };

            if (envelope.kind === "file_metadata") {
                const metadata = JSON.parse(envelope.payload) as FileMetadata;
                const buffer = new FileReassemblyBuffer(metadata);
                this.fileBuffers.set(metadata.id, buffer);
                this.emit("file-metadata", metadata, fromPeerId);
                return;
            }

            if (envelope.kind === "file_chunk") {
                const payload = JSON.parse(envelope.payload) as FileChunkPayload;
                const buffer = this.fileBuffers.get(payload.fileId);
                if (!buffer) return;

                const binary = atob(payload.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                const success = await buffer.addChunk(payload.index, bytes.buffer, payload.hash);
                if (success) {
                    const ackEnvelope = JSON.stringify({
                        kind: "file_ack",
                        payload: JSON.stringify({ fileId: payload.fileId, index: payload.index }),
                    });
                    const peer = this.peers.get(fromPeerId);
                    if (peer?.dc?.readyState === "open") {
                        peer.dc.send(ackEnvelope);
                    }

                    this.emit("file-progress", payload.fileId, buffer.progress, fromPeerId);

                    if (buffer.isComplete) {
                        const blob = buffer.reconstruct();
                        const name = buffer.metadata.name;
                        this.emit("file-complete", payload.fileId, blob, name, fromPeerId);
                        this.fileBuffers.delete(payload.fileId);
                    }
                }
                return;
            }

            if (envelope.kind === "file_ack") {
                const payload = JSON.parse(envelope.payload) as { fileId: string; index: number };
                const transfer = this.activeTransfers.get(payload.fileId);
                if (transfer) {
                    transfer.onAck(payload.index, fromPeerId);
                }
                return;
            }

            if (envelope.kind !== "chat") return;

            let messageJson = envelope.payload;
            if (this.options.encrypt) {
                messageJson = await decryptMessage(envelope.payload, this.options.roomId);
            }

            const message = JSON.parse(messageJson) as P2PChatMessage;
            if (message.fromPeerId === this.options.peerId) return;
            this.emit("message", message);
        } catch (error) {
            this.emit(
                "error",
                error instanceof Error ? error : new Error("Failed to parse P2P message"),
            );
        }
    }

    private removePeer(peerId: string): void {
        const entry = this.peers.get(peerId);
        if (!entry) return;
        entry.dc?.close();
        entry.pc.close();
        this.peers.delete(peerId);
        this.emit("peer-disconnected", peerId);
    }
}

export type { PeerInfo, P2PChatMessage };
