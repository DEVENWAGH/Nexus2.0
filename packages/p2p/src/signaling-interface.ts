import type { SignalingMessage, SignalingServerMessage } from "./types";

export interface ISignalingClient {
    connect(): Promise<void> | void;
    connectAsync(timeoutMs?: number): Promise<void>;
    disconnect(): Promise<void> | void;
    send(message: SignalingMessage): Promise<void> | void;
    readonly connected: boolean;
}

export type SignalingClientOptions = {
    url?: string;
    bootstrapAddrs?: string[];
    onMessage: (message: SignalingServerMessage) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event | Error) => void;
};
