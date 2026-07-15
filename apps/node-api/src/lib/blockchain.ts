import { hashMessageAsync, isSuspicious } from "./blockchain-hash";
import { localBlockchain } from "./local-blockchain";

const BLOCKCHAIN_URL = (
    process.env.BLOCKCHAIN_URL ?? "http://127.0.0.1:5001"
).replace(/\/$/, "");

let isMining = false;
let mineTimeout: ReturnType<typeof setTimeout> | null = null;

function triggerAutoMine() {
    if (isMining) return;
    if (mineTimeout) return;

    mineTimeout = setTimeout(async () => {
        mineTimeout = null;
        if (localBlockchain.getPending().length === 0) return;
        isMining = true;
        try {
            console.log(`[Blockchain] Auto-mining ${localBlockchain.getPending().length} pending transactions...`);
            const minedBlock = await blockchainLogger.minePending();
            if (minedBlock) {
                console.log(`[Blockchain] Auto-mined block #${minedBlock.index} successfully (hash: ${minedBlock.hash.slice(0, 16)}...)`);
            }
        } catch (err) {
            console.error("[Blockchain] Auto-mining failed:", err);
        } finally {
            isMining = false;
            // If new transactions arrived during mining, schedule again
            if (localBlockchain.getPending().length > 0) {
                triggerAutoMine();
            }
        }
    }, 5000);
}

export const blockchainLogger = {
    async hashMessage(message: string): Promise<string> {
        return hashMessageAsync(message);
    },

    checkSuspicious(message: string) {
        return isSuspicious(message);
    },

    async logMessageBackground(
        sender: string,
        recipient: string,
        message: string,
        channelId?: string,
    ): Promise<string> {
        const msgHash = await hashMessageAsync(message);
        void this.logMessage(sender, recipient, message, channelId);
        return msgHash;
    },

    async logMessage(
        sender: string,
        recipient: string,
        message: string,
        channelId?: string,
    ): Promise<string | null> {
        const msgHash = await hashMessageAsync(message);
        const { suspicious, reasons } = isSuspicious(message);

        const payload = {
            type: "message_log",
            msg_hash: msgHash,
            channel_id: channelId,
            timestamp: new Date().toISOString(),
            suspicious,
            reasons,
        };

        // Write to local in-repo blockchain node
        await localBlockchain.addTransaction(sender, recipient, JSON.stringify(payload), "message_log");

        const tx = {
            sender,
            recipient,
            payload: JSON.stringify(payload),
            type: "message_log",
        };

        // Attempt write to external node as well (best-effort)
        try {
            const resp = await fetch(`${BLOCKCHAIN_URL}/transactions/new`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tx),
                signal: AbortSignal.timeout(2000),
            });
            if (resp.ok) {
                console.log(`[Blockchain] External OK - Message logged (hash=${msgHash.slice(0, 12)}...)`);
            }
        } catch {
            console.log(`[Blockchain] External Offline - fallback to local in-repo ledger (hash=${msgHash.slice(0, 12)}...)`);
        }

        // Trigger automatic Proof-of-Work mining in the background
        triggerAutoMine();

        return msgHash;
    },

    async getChainStatus() {
        const blocks = localBlockchain.getBlocks();
        
        // Check external status
        try {
            const resp = await fetch(`${BLOCKCHAIN_URL}/chain`, {
                signal: AbortSignal.timeout(2000),
            });
            if (resp.ok) {
                const data = (await resp.json()) as {
                    length?: number;
                    node_id?: string;
                };
                return {
                    connected: true,
                    length: data.length ?? blocks.length,
                    node_id: data.node_id ?? "external-node",
                    local_length: blocks.length,
                };
            }
        } catch {
            // ignore
        }

        return { 
            connected: true, 
            length: blocks.length, 
            node_id: "local-in-repo-blockchain",
            local_length: blocks.length,
        };
    },

    async minePending() {
        // Mine locally first
        const minedBlock = await localBlockchain.minePending();
        
        // Also mine externally if reachable
        try {
            const resp = await fetch(`${BLOCKCHAIN_URL}/mine`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
                signal: AbortSignal.timeout(2000),
            });
            if (resp.ok) {
                return resp.json();
            }
        } catch (e) {
            // Ignore external mining fail
        }

        return minedBlock;
    },
};
