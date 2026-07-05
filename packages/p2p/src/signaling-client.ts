import type { SignalingMessage, SignalingServerMessage } from "./types";

export type SignalingClientOptions = {
    url: string;
    onMessage: (message: SignalingServerMessage) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
};

export class SignalingClient {
    private ws: WebSocket | null = null;
    private readonly options: SignalingClientOptions;

    constructor(options: SignalingClientOptions) {
        this.options = options;
    }

    connect(): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return;
        }

        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
            this.options.onOpen?.();
        };

        this.ws.onclose = () => {
            this.options.onClose?.();
        };

        this.ws.onerror = (event) => {
            this.options.onError?.(event);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(
                    String(event.data),
                ) as SignalingServerMessage;
                this.options.onMessage(message);
            } catch {
                this.options.onMessage({
                    type: "error",
                    message: "Invalid signaling payload",
                });
            }
        };
    }

    send(message: SignalingMessage): void {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error("Signaling socket is not connected");
        }
        this.ws.send(JSON.stringify(message));
    }

    disconnect(): void {
        this.ws?.close();
        this.ws = null;
    }

    get connected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    connectAsync(timeoutMs = 10_000): Promise<void> {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.connect();

            if (!this.ws) {
                reject(new Error("Failed to create WebSocket instance"));
                return;
            }

            const ws = this.ws;

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error("Signaling connection timeout"));
            }, timeoutMs);

            const handleOpen = () => {
                cleanup();
                resolve();
            };

            const handleError = () => {
                cleanup();
                reject(new Error("Signaling connection failed"));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                ws.removeEventListener("open", handleOpen);
                ws.removeEventListener("error", handleError);
            };

            ws.addEventListener("open", handleOpen);
            ws.addEventListener("error", handleError);
        });
    }
}
