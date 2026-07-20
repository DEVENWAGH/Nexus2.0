/**
 * Lightweight WebRTC signaling relay.
 * Stores NO messages — only room membership and SDP/ICE forwarding.
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

type PeerInfo = {
    peerId: string;
    userId?: string;
    ws: WebSocket;
};

type Room = Map<string, PeerInfo>;

type ClientMessage =
    | { type: "join"; roomId: string; peerId: string; userId?: string }
    | { type: "leave"; roomId: string; peerId: string }
    | {
          type: "signal";
          roomId: string;
          toPeerId: string;
          payload: unknown;
      };

const PORT = Number(process.env.SIGNALING_PORT || process.env.PORT || 3001);
const rooms = new Map<string, Room>();
const socketRooms = new WeakMap<WebSocket, { roomId: string; peerId: string }>();

function send(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function getRoomPeers(room: Room, excludePeerId?: string): PeerInfo[] {
    return [...room.values()].filter((p) => p.peerId !== excludePeerId);
}

function removePeer(roomId: string, peerId: string): void {
    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(peerId);
    if (room.size === 0) {
        rooms.delete(roomId);
    }

    for (const peer of room.values()) {
        send(peer.ws, { type: "peer-left", peerId });
    }
}

const httpServer = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            service: "nexus-p2p-gossipsub-bootstrap-relay",
            mode: "decentralized-gossipsub-relay",
            status: "ok",
            metadataLogging: "disabled",
            rooms: rooms.size,
            peers: [...rooms.values()].reduce((n, r) => n + r.size, 0),
        }),
    );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
        let message: ClientMessage;
        try {
            message = JSON.parse(String(raw)) as ClientMessage;
        } catch {
            send(ws, { type: "error", message: "Invalid JSON" });
            return;
        }

        switch (message.type) {
            case "join": {
                const { roomId, peerId, userId } = message;
                if (!roomId || !peerId) {
                    send(ws, { type: "error", message: "roomId and peerId required" });
                    return;
                }

                let room = rooms.get(roomId);
                if (!room) {
                    room = new Map();
                    rooms.set(roomId, room);
                }

                if (room.has(peerId)) {
                    const existing = room.get(peerId)!;
                    existing.ws.close();
                }

                room.set(peerId, { peerId, userId, ws });
                socketRooms.set(ws, { roomId, peerId });

                const peers = getRoomPeers(room, peerId).map((p) => ({
                    peerId: p.peerId,
                    userId: p.userId,
                }));

                send(ws, { type: "joined", roomId, peerId, peers });

                for (const peer of room.values()) {
                    if (peer.peerId !== peerId) {
                        send(peer.ws, { type: "peer-joined", peerId, userId });
                    }
                }
                break;
            }

            case "leave": {
                const meta = socketRooms.get(ws);
                if (meta) {
                    removePeer(meta.roomId, meta.peerId);
                    socketRooms.delete(ws);
                }
                break;
            }

            case "signal": {
                const room = rooms.get(message.roomId);
                const target = room?.get(message.toPeerId);
                const meta = socketRooms.get(ws);
                if (!target || !meta) {
                    send(ws, { type: "error", message: "Target peer not found" });
                    return;
                }
                send(target.ws, {
                    type: "signal",
                    fromPeerId: meta.peerId,
                    payload: message.payload,
                });
                break;
            }

            default:
                send(ws, { type: "error", message: "Unknown message type" });
        }
    });

    ws.on("close", () => {
        const meta = socketRooms.get(ws);
        if (meta) {
            removePeer(meta.roomId, meta.peerId);
            socketRooms.delete(ws);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log("=".repeat(60));
    console.log("  Nexus P2P GossipSub Bootstrap & Relay Node");
    console.log(`  WebSocket Relay: ws://localhost:${PORT}`);
    console.log(`  Health Check:    http://localhost:${PORT}/`);
    console.log("  Mode:             Decentralized GossipSub Mesh Relay");
    console.log("  Privacy:          Zero connection metadata logging");
    console.log("=".repeat(60));
});
