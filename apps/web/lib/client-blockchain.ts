/**
 * client-blockchain.ts — Browser-side Proof-of-Work blockchain.
 *
 * Port of apps/node-api/src/lib/local-blockchain.ts to run entirely in the
 * browser. The chain is persisted in IndexedDB (nexus-blockchain store) and
 * mining is offloaded to a Web Worker to keep the UI responsive.
 *
 * Sync strategy: When a WebRTC peer connects, both sides exchange their
 * chains and adopt the longer valid one (Nakamoto consensus).
 */

"use client";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Transaction {
  sender: string;
  recipient: string;
  payload: string;
  type: string;
  hash?: string;
}

export interface Block {
  index: number;
  timestamp: string;
  transactions: Transaction[];
  proof: number;
  previousHash: string;
  hash: string;
}

// ── IndexedDB persistence ──────────────────────────────────────────────────

const DB_NAME = "nexus-blockchain";
const DB_VERSION = 1;
const CHAIN_STORE = "chain";
const PENDING_STORE = "pending";

async function openBlockchainDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CHAIN_STORE)) {
        db.createObjectStore(CHAIN_STORE, { keyPath: "index" });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

async function loadChain(): Promise<Block[]> {
  const db = await openBlockchainDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAIN_STORE, "readonly");
    const req = tx.objectStore(CHAIN_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        ((req.result as Block[]) ?? []).sort((a, b) => a.index - b.index),
      );
    req.onerror = () => reject(req.error);
  });
}

async function persistBlock(block: Block): Promise<void> {
  const db = await openBlockchainDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAIN_STORE, "readwrite");
    tx.objectStore(CHAIN_STORE).put(block);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadPending(): Promise<(Transaction & { id?: number })[]> {
  const db = await openBlockchainDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => resolve((req.result as (Transaction & { id?: number })[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function persistPending(tx: Transaction): Promise<number> {
  const db = await openBlockchainDB();
  return new Promise((resolve, reject) => {
    const idbTx = db.transaction(PENDING_STORE, "readwrite");
    const req = idbTx.objectStore(PENDING_STORE).add(tx);
    req.onsuccess = () => resolve(req.result as number);
    idbTx.onerror = () => reject(idbTx.error);
  });
}

async function clearPending(): Promise<void> {
  const db = await openBlockchainDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── SHA-256 utility ────────────────────────────────────────────────────────

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Web Worker bridge ──────────────────────────────────────────────────────

let _worker: Worker | null = null;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new Worker(
      new URL("../workers/blockchain-worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return _worker;
}

function mineViaWorker(lastProof: number): Promise<number> {
  return new Promise((resolve) => {
    const worker = getWorker();
    const requestId = crypto.randomUUID();
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; proof: number; requestId: string };
      if (msg.type === "result" && msg.requestId === requestId) {
        worker.removeEventListener("message", handler);
        resolve(msg.proof);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "mine", lastProof, requestId });
  });
}

function hashViaWorker(data: string): Promise<string> {
  return new Promise((resolve) => {
    const worker = getWorker();
    const requestId = crypto.randomUUID();
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; value: string; requestId: string };
      if (msg.type === "hash" && msg.requestId === requestId) {
        worker.removeEventListener("message", handler);
        resolve(msg.value);
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "hash", data, requestId });
  });
}

// ── Client Blockchain class ────────────────────────────────────────────────

class ClientBlockchain {
  private chain: Block[] = [];
  private pending: (Transaction & { id?: number })[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.chain = await loadChain();
    this.pending = await loadPending();

    // Create genesis block if chain is empty
    if (this.chain.length === 0) {
      await this._createBlock(100, "1");
    }
    this.initialized = true;
  }

  private async _hashBlock(block: Omit<Block, "hash">): Promise<string> {
    return sha256Hex(
      JSON.stringify({
        index: block.index,
        timestamp: block.timestamp,
        transactions: block.transactions,
        proof: block.proof,
        previousHash: block.previousHash,
      }),
    );
  }

  private async _createBlock(proof: number, previousHash: string): Promise<Block> {
    const rawPending = this.pending.map(({ id: _id, ...tx }) => tx);
    const block: Omit<Block, "hash"> = {
      index: this.chain.length + 1,
      timestamp: new Date().toISOString(),
      transactions: rawPending,
      proof,
      previousHash,
    };
    const hash = await this._hashBlock(block);
    const fullBlock: Block = { ...block, hash };

    this.chain.push(fullBlock);
    await persistBlock(fullBlock);

    this.pending = [];
    await clearPending();

    return fullBlock;
  }

  get lastBlock(): Block {
    return this.chain[this.chain.length - 1];
  }

  async addTransaction(
    sender: string,
    recipient: string,
    payload: string,
    type: string,
  ): Promise<number> {
    const hash = await sha256Hex(payload);
    const tx: Transaction = { sender, recipient, payload, type, hash };
    const id = await persistPending(tx);
    this.pending.push({ ...tx, id });
    return this.lastBlock.index + 1;
  }

  async minePending(): Promise<Block | null> {
    if (this.pending.length === 0) return null;
    const lastProof = this.lastBlock.proof;
    const proof = await mineViaWorker(lastProof);
    const previousHash = this.lastBlock.hash;
    return this._createBlock(proof, previousHash);
  }

  getBlocks(): Block[] {
    return [...this.chain];
  }

  getPending(): Transaction[] {
    return this.pending.map(({ id: _id, ...tx }) => tx);
  }

  async verifyMessage(msgHash: string): Promise<{
    verified: boolean;
    blockIndex: number;
    timestamp: string;
    blockHash: string;
  } | null> {
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        try {
          const parsed = JSON.parse(tx.payload) as { msg_hash?: string };
          if (parsed.msg_hash === msgHash) {
            return {
              verified: true,
              blockIndex: block.index,
              timestamp: block.timestamp,
              blockHash: block.hash,
            };
          }
        } catch {
          // Non-message transactions — ignore
        }
      }
    }
    return null;
  }

  /**
   * Validates and merges an incoming chain (from a WebRTC peer).
   * Adopts the incoming chain if it is longer and cryptographically valid.
   */
  async syncChain(incomingChain: Block[]): Promise<boolean> {
    if (incomingChain.length <= this.chain.length) return false;

    // Validate the incoming chain integrity
    for (let i = 1; i < incomingChain.length; i++) {
      const prev = incomingChain[i - 1];
      const curr = incomingChain[i];
      const expectedHash = await sha256Hex(
        JSON.stringify({
          index: prev.index,
          timestamp: prev.timestamp,
          transactions: prev.transactions,
          proof: prev.proof,
          previousHash: prev.previousHash,
        }),
      );
      if (curr.previousHash !== expectedHash) return false;
      if (!curr.hash.startsWith("0000")) return false; // simplified PoW check
    }

    // Adopt the longer valid chain
    this.chain = incomingChain;
    for (const block of incomingChain) {
      await persistBlock(block);
    }
    return true;
  }

  async hashMessage(message: string): Promise<string> {
    return hashViaWorker(message);
  }
}

// Singleton — created lazily, initialized on first use
let _instance: ClientBlockchain | null = null;

export async function getClientBlockchain(): Promise<ClientBlockchain> {
  if (!_instance) {
    _instance = new ClientBlockchain();
  }
  await _instance.init();
  return _instance;
}

export type { ClientBlockchain };
