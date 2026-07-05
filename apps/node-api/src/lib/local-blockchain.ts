import { hashMessageAsync } from "./blockchain-hash";

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

class LocalBlockchain {
    private chain: Block[] = [];
    private pendingTransactions: Transaction[] = [];

    constructor() {
        // Create genesis block
        void this.createBlock(100, "1");
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
        const block: Omit<Block, "hash"> = {
            index: this.chain.length + 1,
            timestamp: new Date().toISOString(),
            transactions: [...this.pendingTransactions],
            proof,
            previousHash,
        };

        const hash = await this.hashBlock(block);
        const fullBlock: Block = { ...block, hash };

        this.pendingTransactions = [];
        this.chain.push(fullBlock);
        return fullBlock;
    }

    async addTransaction(sender: string, recipient: string, payload: string, type: string): Promise<number> {
        const payloadHash = await hashMessageAsync(payload);
        const tx: Transaction = {
            sender,
            recipient,
            payload,
            type,
            hash: payloadHash,
        };
        this.pendingTransactions.push(tx);
        return this.lastBlock.index + 1;
    }

    get lastBlock(): Block {
        return this.chain[this.chain.length - 1];
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

    getBlocks(): Block[] {
        return this.chain;
    }

    getPending(): Transaction[] {
        return this.pendingTransactions;
    }

    async minePending(): Promise<Block | null> {
        if (this.pendingTransactions.length === 0) {
            return null;
        }

        const lastBlock = this.lastBlock;
        const lastProof = lastBlock.proof;
        const proof = await this.proofOfWork(lastProof);
        const previousHash = lastBlock.hash;

        return this.createBlock(proof, previousHash);
    }

    async verifyMessage(msgHash: string): Promise<{ verified: boolean; blockIndex: number; timestamp: string; blockHash: string } | null> {
        for (const block of this.chain) {
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
}

export const localBlockchain = new LocalBlockchain();
