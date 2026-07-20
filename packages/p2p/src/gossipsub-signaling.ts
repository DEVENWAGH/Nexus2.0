import type { SignalingMessage, SignalingServerMessage, SignalPayload } from "./types";
import type { ISignalingClient, SignalingClientOptions } from "./signaling-interface";

export type GossipSubSignalingOptions = SignalingClientOptions & {
    peerId?: string;
    roomId?: string;
    bootstrapAddrs?: string[];
};

type GossipMessagePayload =
    | {
          type: "gossip-join";
          roomId: string;
          peerId: string;
          userId?: string;
          timestamp: number;
      }
    | {
          type: "gossip-leave";
          roomId: string;
          peerId: string;
          timestamp: number;
      }
    | {
          type: "gossip-signal";
          roomId: string;
          fromPeerId: string;
          toPeerId: string;
          payload: SignalPayload;
          timestamp: number;
      }
    | {
          type: "gossip-presence";
          roomId: string;
          peerId: string;
          userId?: string;
          timestamp: number;
      };

export class GossipSubSignalingClient implements ISignalingClient {
    private options: GossipSubSignalingOptions;
    private activeRoomId: string | null = null;
    private localPeerId: string | null = null;
    private localUserId: string | undefined = undefined;
    private knownPeers: Map<string, { peerId: string; userId?: string; lastSeen: number }> = new Map();
    private isConnected: boolean = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private pubsubTarget: EventTarget = new EventTarget();

    constructor(options: GossipSubSignalingOptions) {
        this.options = options;
        if (options.peerId) {
            this.localPeerId = options.peerId;
        }
    }

    public async connect(): Promise<void> {
        if (this.isConnected) return;
        this.isConnected = true;
        this.options.onOpen?.();

        // Start periodic presence heartbeat for decentralized room membership discovery
        this.heartbeatTimer = setInterval(() => {
            this.broadcastPresence();
            this.cleanStalePeers();
        }, 5000);
    }

    public async connectAsync(timeoutMs = 10_000): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("GossipSub signaling connection timeout"));
            }, timeoutMs);

            try {
                this.connect();
                clearTimeout(timer);
                resolve();
            } catch (err) {
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    public get connected(): boolean {
        return this.isConnected;
    }

    public async send(message: SignalingMessage): Promise<void> {
        if (!this.isConnected) {
            throw new Error("GossipSub signaling is not connected");
        }

        switch (message.type) {
            case "join": {
                this.activeRoomId = message.roomId;
                this.localPeerId = message.peerId;
                this.localUserId = message.userId;

                const gossipJoin: GossipMessagePayload = {
                    type: "gossip-join",
                    roomId: message.roomId,
                    peerId: message.peerId,
                    userId: message.userId,
                    timestamp: Date.now(),
                };

                this.publishToTopic(message.roomId, gossipJoin);

                // Notify caller of joined room with current known mesh peers
                const existingPeers = Array.from(this.knownPeers.values()).map((p) => ({
                    peerId: p.peerId,
                    userId: p.userId,
                }));

                this.options.onMessage({
                    type: "joined",
                    roomId: message.roomId,
                    peerId: message.peerId,
                    peers: existingPeers,
                });
                break;
            }

            case "leave": {
                if (this.activeRoomId) {
                    const gossipLeave: GossipMessagePayload = {
                        type: "gossip-leave",
                        roomId: message.roomId,
                        peerId: message.peerId,
                        timestamp: Date.now(),
                    };
                    this.publishToTopic(message.roomId, gossipLeave);
                }
                this.activeRoomId = null;
                this.knownPeers.clear();
                break;
            }

            case "signal": {
                const gossipSignal: GossipMessagePayload = {
                    type: "gossip-signal",
                    roomId: message.roomId,
                    fromPeerId: this.localPeerId || "",
                    toPeerId: message.toPeerId,
                    payload: message.payload,
                    timestamp: Date.now(),
                };
                this.publishToTopic(message.roomId, gossipSignal);
                break;
            }
        }
    }

    public async disconnect(): Promise<void> {
        if (this.activeRoomId && this.localPeerId) {
            await this.send({
                type: "leave",
                roomId: this.activeRoomId,
                peerId: this.localPeerId,
            });
        }

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        this.isConnected = false;
        this.options.onClose?.();
    }

    private publishToTopic(roomId: string, payload: GossipMessagePayload): void {
        const topic = this.getTopicName(roomId);
        const encoded = new TextEncoder().encode(JSON.stringify(payload));
        
        // Dispatch locally for cross-tab or in-process peer simulation,
        // and broadcast over GossipSub topic channel (using BroadcastChannel API for browser mesh)
        if (typeof BroadcastChannel !== "undefined") {
            const bc = new BroadcastChannel(topic);
            bc.postMessage(JSON.stringify(payload));
            bc.close();
        }

        // Simulate network delivery event
        this.pubsubTarget.dispatchEvent(
            new CustomEvent("gossip-message", { detail: payload })
        );
    }

    private handleIncomingGossip(payload: GossipMessagePayload): void {
        if (!this.activeRoomId || payload.roomId !== this.activeRoomId) return;

        switch (payload.type) {
            case "gossip-join": {
                if (payload.peerId === this.localPeerId) return;

                this.knownPeers.set(payload.peerId, {
                    peerId: payload.peerId,
                    userId: payload.userId,
                    lastSeen: Date.now(),
                });

                this.options.onMessage({
                    type: "peer-joined",
                    peerId: payload.peerId,
                    userId: payload.userId,
                });

                // Respond with presence so joining peer discovers us
                this.broadcastPresence();
                break;
            }

            case "gossip-presence": {
                if (payload.peerId === this.localPeerId) return;

                const isNew = !this.knownPeers.has(payload.peerId);
                this.knownPeers.set(payload.peerId, {
                    peerId: payload.peerId,
                    userId: payload.userId,
                    lastSeen: Date.now(),
                });

                if (isNew) {
                    this.options.onMessage({
                        type: "peer-joined",
                        peerId: payload.peerId,
                        userId: payload.userId,
                    });
                }
                break;
            }

            case "gossip-leave": {
                if (this.knownPeers.has(payload.peerId)) {
                    this.knownPeers.delete(payload.peerId);
                    this.options.onMessage({
                        type: "peer-left",
                        peerId: payload.peerId,
                    });
                }
                break;
            }

            case "gossip-signal": {
                if (payload.toPeerId === this.localPeerId) {
                    this.options.onMessage({
                        type: "signal",
                        fromPeerId: payload.fromPeerId,
                        payload: payload.payload,
                    });
                }
                break;
            }
        }
    }

    private broadcastPresence(): void {
        if (this.activeRoomId && this.localPeerId) {
            const presence: GossipMessagePayload = {
                type: "gossip-presence",
                roomId: this.activeRoomId,
                peerId: this.localPeerId,
                userId: this.localUserId,
                timestamp: Date.now(),
            };
            this.publishToTopic(this.activeRoomId, presence);
        }
    }

    private cleanStalePeers(): void {
        const now = Date.now();
        const timeout = 15_000;
        for (const [peerId, peer] of this.knownPeers.entries()) {
            if (now - peer.lastSeen > timeout) {
                this.knownPeers.delete(peerId);
                this.options.onMessage({
                    type: "peer-left",
                    peerId,
                });
            }
        }
    }

    private getTopicName(roomId: string): string {
        return `nexus/v1/signaling/${roomId}`;
    }
}
