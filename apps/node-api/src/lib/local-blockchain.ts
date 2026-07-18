import { prisma } from "@repo/db";
import { hashMessageAsync } from "./blockchain-hash";

export interface Transaction {
    id?: string;
    sender: string;
    recipient: string;
    payload: string;
    type: string;
    hash?: string;
    createdAt?: string;
}

export interface Block {
    id?: string;
    index: number;
    timestamp: string;
    transactions: Transaction[];
    proof: number;
    previousHash: string;
    hash: string;
}

class LocalBlockchain {
    private initialized = false;

    // Helper to ensure genesis block exists and databases are ready
    private async ensureInitialized() {
        if (this.initialized) return;
        try {
            // Count blocks in OrbitDB. We pass an empty object because OrbitDB executeQuery supports standard Prisma arguments
            const count = await (prisma as any).blockchainBlock.count({});
            if (count === 0) {
                console.log("[Blockchain] Chain is empty. Creating genesis block...");
                const genesisBlock: Omit<Block, "hash"> = {
                    index: 1,
                    timestamp: new Date().toISOString(),
                    transactions: [],
                    proof: 100,
                    previousHash: "1",
                };
                const hash = await this.hashBlock(genesisBlock);
                await (prisma as any).blockchainBlock.create({
                    data: {
                        ...genesisBlock,
                        hash,
                    }
                });
                console.log("[Blockchain] Genesis block created successfully.");
            }
            this.initialized = true;
        } catch (err) {
            console.error("[Blockchain] Initialization failed:", err);
        }
    }

    async hashBlock(block: Omit<Block, "hash">): Promise<string> {
        const blockString = JSON.stringify({
            index: block.index,
            timestamp: block.timestamp,
            transactions: block.transactions,
            proof: block.proof,
            previousHash: block.previousHash,
        });
        return hashMessageAsync(blockString);
    }

    async createBlock(proof: number, previousHash: string): Promise<Block> {
        await this.ensureInitialized();
        
        // Fetch all pending transactions
        const pendingTxs = await this.getPending();
        
        // Load the blocks to determine the index
        const blocks = await this.getBlocks();
        const nextIndex = blocks.length + 1;

        const blockData: Omit<Block, "hash"> = {
            index: nextIndex,
            timestamp: new Date().toISOString(),
            transactions: pendingTxs,
            proof,
            previousHash,
        };

        const hash = await this.hashBlock(blockData);
        const fullBlock: Block = { ...blockData, hash };

        // Write block to OrbitDB
        await (prisma as any).blockchainBlock.create({
            data: fullBlock
        });

        // Clear pending transactions that were just mined
        // We delete them from the OrbitDB document store
        const pendingDocs = await (prisma as any).blockchainTransaction.findMany({});
        for (const tx of pendingDocs) {
            await (prisma as any).blockchainTransaction.delete({
                where: { id: tx.id }
            });
        }

        return fullBlock;
    }

    async addTransaction(sender: string, recipient: string, payload: string, type: string): Promise<number> {
        await this.ensureInitialized();
        
        const payloadHash = await hashMessageAsync(payload);
        const tx: Omit<Transaction, "id"> = {
            sender,
            recipient,
            payload,
            type,
            hash: payloadHash,
            createdAt: new Date().toISOString(),
        };

        // Write pending transaction to OrbitDB
        await (prisma as any).blockchainTransaction.create({
            data: tx
        });

        const lastBlock = await this.getLastBlock();
        return lastBlock.index + 1;
    }

    async getLastBlock(): Promise<Block> {
        await this.ensureInitialized();
        const blocks = await this.getBlocks();
        return blocks[blocks.length - 1];
    }

    async proofOfWork(lastProof: number): Promise<number> {
        let proof = 0;
        while (!(await this.validProof(lastProof, proof))) {
            proof++;
        }
        return proof;
    }

    async validProof(lastProof: number, proof: number): Promise<boolean> {
        const guess = `${lastProof}${proof}`;
        const guessHash = await hashMessageAsync(guess);
        return guessHash.substring(0, 4) === "0000"; // PoW target (4 leading zeros)
    }

    async getBlocks(): Promise<Block[]> {
        await this.ensureInitialized();
        try {
            const blocks = await (prisma as any).blockchainBlock.findMany({});
            // Sort by index to preserve chain order
            return (blocks as Block[]).sort((a, b) => a.index - b.index);
        } catch (err) {
            console.error("[Blockchain] Failed to get blocks from OrbitDB:", err);
            return [];
        }
    }

    async getPending(): Promise<Transaction[]> {
        await this.ensureInitialized();
        try {
            const txs = await (prisma as any).blockchainTransaction.findMany({});
            return txs as Transaction[];
        } catch (err) {
            console.error("[Blockchain] Failed to get pending transactions from OrbitDB:", err);
            return [];
        }
    }

    async minePending(): Promise<Block | null> {
        await this.ensureInitialized();
        const pending = await this.getPending();
        if (pending.length === 0) {
            return null;
        }

        const lastBlock = await this.getLastBlock();
        const lastProof = lastBlock.proof;
        const proof = await this.proofOfWork(lastProof);
        const previousHash = lastBlock.hash;

        return this.createBlock(proof, previousHash);
    }

    async verifyMessage(msgHash: string): Promise<{ verified: boolean; blockIndex: number; timestamp: string; blockHash: string } | null> {
        await this.ensureInitialized();
        const blocks = await this.getBlocks();
        for (const block of blocks) {
            for (const tx of block.transactions) {
                try {
                    const parsedPayload = JSON.parse(tx.payload);
                    if (parsedPayload.msg_hash === msgHash) {
                        return {
                            verified: true,
                            blockIndex: block.index,
                            timestamp: block.timestamp,
                            blockHash: block.hash,
                        };
                    }
                } catch {
                    // Ignore parsing errors for other non-message transactions
                }
            }
        }
        return null;
    }

    async pruneExpiredBlockchainData(): Promise<{ prunedBlocks: number; prunedTransactions: number }> {
        await this.ensureInitialized();
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        let prunedBlocks = 0;
        let prunedTransactions = 0;

        try {
            // Delete expired pending transactions
            const pendingTxs = await (prisma as any).blockchainTransaction.findMany({});
            for (const tx of pendingTxs) {
                if (tx.createdAt && new Date(tx.createdAt) < cutoff) {
                    await (prisma as any).blockchainTransaction.delete({
                        where: { id: tx.id }
                    });
                    prunedTransactions++;
                }
            }

            // Delete expired blocks, except the genesis block (index = 1)
            const blocks = await (prisma as any).blockchainBlock.findMany({});
            for (const block of blocks) {
                if (block.index !== 1 && new Date(block.timestamp) < cutoff) {
                    await (prisma as any).blockchainBlock.delete({
                        where: { id: block.id }
                    });
                    prunedBlocks++;
                }
            }
            
            if (prunedBlocks > 0 || prunedTransactions > 0) {
                console.log(`[Blockchain] Pruned ${prunedBlocks} expired blocks and ${prunedTransactions} expired pending transactions.`);
            }
        } catch (err) {
            console.error("[Blockchain] Pruning failed:", err);
        }

        return { prunedBlocks, prunedTransactions };
    }

    /** Wipe the entire blockchain ledger and re-create a fresh genesis block.
     *  Called after a full message purge — when there are zero messages left
     *  on the platform, the audit ledger should also start clean.
     */
    async purgeAllBlockchainData(): Promise<{ prunedBlocks: number; prunedTransactions: number }> {
        let prunedBlocks = 0;
        let prunedTransactions = 0;
        try {
            // Delete ALL pending transactions
            const pendingTxs = await (prisma as any).blockchainTransaction.findMany({});
            for (const tx of pendingTxs) {
                await (prisma as any).blockchainTransaction.delete({ where: { id: tx.id } });
                prunedTransactions++;
            }

            // Delete ALL blocks (including genesis — we'll recreate it fresh)
            const blocks = await (prisma as any).blockchainBlock.findMany({});
            for (const block of blocks) {
                await (prisma as any).blockchainBlock.delete({ where: { id: block.id } });
                prunedBlocks++;
            }

            // Reset init flag so a fresh genesis block is created on next use
            this.initialized = false;
            await this.ensureInitialized();

            console.log(`[Blockchain] Full purge complete — wiped ${prunedBlocks} blocks and ${prunedTransactions} pending TXs. Fresh genesis block created.`);
        } catch (err) {
            console.error("[Blockchain] Full purge failed:", err);
        }
        return { prunedBlocks, prunedTransactions };
    }
}

export const localBlockchain = new LocalBlockchain();
