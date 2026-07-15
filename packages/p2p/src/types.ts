import type { FileMetadata } from "./file-transfer";

export type SignalingMessage =
    | { type: "join"; roomId: string; peerId: string; userId?: string; ticket: string }
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
    did?: string;
    signature?: string;
};

export type ChatWireEnvelope = {
    kind: "chat";
    v?: number;
    hop?: number;
    ttl?: number;
    prevPeerId?: string;
    payload: string;
};

export type GossipStats = {
    relayed: number;
    droppedDuplicate: number;
    droppedInvalid: number;
    droppedRateLimit: number;
};

export type P2PMeshEvents = {
    message: (message: P2PChatMessage) => void;
    "peer-connected": (peerId: string) => void;
    "peer-disconnected": (peerId: string) => void;
    "room-joined": (peers: PeerInfo[]) => void;
    "file-metadata": (metadata: FileMetadata, fromPeerId: string) => void;
    "file-progress": (fileId: string, progress: number, fromPeerId: string) => void;
    "file-complete": (fileId: string, blob: Blob, name: string, fromPeerId: string) => void;
    "gossip-stats": (stats: GossipStats) => void;
    error: (error: Error) => void;
};

export type SignMessageFn = (
    content: string,
    messageId: string,
) => Promise<{ did: string; signature: string } | null>;

export type VerifyMessageFn = (
    did: string,
    signature: string,
    content: string,
) => Promise<boolean>;
