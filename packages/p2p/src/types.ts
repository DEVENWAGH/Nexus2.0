import type { FileMetadata } from "./file-transfer";
import type { RelayEnvelope, RouteEntry } from "./relay-router";

export type { RelayEnvelope, RouteEntry };

export type SignalingMessage =
    | { type: "join"; roomId: string; peerId: string; userId?: string }
    | { type: "leave"; roomId: string; peerId: string }
    | {
          type: "signal";
          roomId: string;
          toPeerId: string;
          payload: SignalPayload;
      };

export type SignalingServerMessage =
    | {
          type: "joined";
          roomId: string;
          peerId: string;
          peers: PeerInfo[];
      }
    | { type: "peer-joined"; peerId: string; userId?: string }
    | { type: "peer-left"; peerId: string }
    | {
          type: "signal";
          fromPeerId: string;
          payload: SignalPayload;
      }
    | { type: "error"; message: string };

export type SignalPayload =
    | { kind: "offer"; sdp: RTCSessionDescriptionInit }
    | { kind: "answer"; sdp: RTCSessionDescriptionInit }
    | { kind: "ice"; candidate: RTCIceCandidateInit };

export type PeerInfo = {
    peerId: string;
    userId?: string;
};

export type P2PChatMessage = {
    id: string;
    fromPeerId: string;
    fromUserId?: string;
    content: string;
    encrypted: boolean;
    timestamp: number;
};

export type P2PMeshEvents = {
    message: (message: P2PChatMessage) => void;
    "peer-connected": (peerId: string) => void;
    "peer-disconnected": (peerId: string) => void;
    "room-joined": (peers: PeerInfo[]) => void;
    "file-metadata": (metadata: FileMetadata, fromPeerId: string) => void;
    "file-progress": (fileId: string, progress: number, fromPeerId: string) => void;
    "file-complete": (fileId: string, blob: Blob, name: string, fromPeerId: string) => void;
    /** A relay envelope was forwarded through this node to another peer */
    "relay-forwarded": (relayId: string, from: string, to: string) => void;
    /** A relay envelope was dropped (duplicate, expired, loop, ttl, bad sig) */
    "relay-dropped": (relayId: string, reason: string) => void;
    /** A route-table entry was updated from a received relay path */
    "route-updated": (peerId: string, hops: number, via: string) => void;
    error: (error: Error) => void;
};
