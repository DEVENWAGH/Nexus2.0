/**
 * Utilities for P2P Chunk-Based File Transfer in browser environment.
 */

export type FileMetadata = {
    id: string;
    name: string;
    size: number;
    type: string;
    totalChunks: number;
    hash: string; // SHA-256 hash of the entire file
};

export type FileChunkPayload = {
    fileId: string;
    index: number;
    data: string; // Base64 chunk string
    hash: string; // SHA-256 chunk hash for integrity check
};

/** Computes SHA-256 hash of an ArrayBuffer. */
export async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/** Slices a File into ArrayBuffer chunks. */
export async function getFileChunk(
    file: File,
    chunkIndex: number,
    chunkSize: number = 32768, // 32KB default WebRTC buffer safe size
): Promise<{ buffer: ArrayBuffer; start: number; end: number }> {
    const start = chunkIndex * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const blob = file.slice(start, end);
    const buffer = await blob.arrayBuffer();
    return { buffer, start, end };
}

/** Helper class to buffer and reassemble incoming file chunks. */
export class FileReassemblyBuffer {
    private chunks: ArrayBuffer[] = [];
    private receivedCount = 0;
    private metadata: FileMetadata;

    constructor(metadata: FileMetadata) {
        this.metadata = metadata;
        this.chunks = new Array(metadata.totalChunks);
    }

    /** Adds a chunk, verifying its integrity hash. */
    async addChunk(index: number, chunkBuffer: ArrayBuffer, expectedHash: string): Promise<boolean> {
        const computed = await computeBufferHash(chunkBuffer);
        if (computed !== expectedHash) {
            console.error(`[FileTransfer] Chunk ${index} hash mismatch!`);
            return false;
        }

        if (!this.chunks[index]) {
            this.chunks[index] = chunkBuffer;
            this.receivedCount++;
        }
        return true;
    }

    get progress(): number {
        return this.metadata.totalChunks > 0
            ? Math.round((this.receivedCount / this.metadata.totalChunks) * 100)
            : 0;
    }

    get isComplete(): boolean {
        return this.receivedCount === this.metadata.totalChunks;
    }

    /** Combines chunks into a single Blob and triggers browser download. */
    reconstruct(): Blob {
        return new Blob(this.chunks, { type: this.metadata.type });
    }
}
