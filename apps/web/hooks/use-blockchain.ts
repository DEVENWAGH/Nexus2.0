"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientBlockchain, type Block, type Transaction } from "@/lib/client-blockchain";

export type BlockchainState = {
  blocks: Block[];
  pending: Transaction[];
  isMining: boolean;
  lastMinedBlock: Block | null;
};

/**
 * useBlockchain — React hook for the client-side IndexedDB blockchain.
 *
 * Exposes the current chain state and actions:
 *  - `addTransaction`: log a message hash to the pending pool
 *  - `mine`: trigger Proof-of-Work mining (runs in Web Worker)
 *  - `verifyMessage`: check if a hash exists in any block
 *  - `syncChain`: merge an incoming WebRTC peer's chain
 */
export function useBlockchain() {
  const [state, setState] = useState<BlockchainState>({
    blocks: [],
    pending: [],
    isMining: false,
    lastMinedBlock: null,
  });
  const autoMineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialise & refresh ───────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const bc = await getClientBlockchain();
      setState((prev) => ({
        ...prev,
        blocks: bc.getBlocks(),
        pending: bc.getPending(),
      }));
    } catch (err) {
      console.error("[useBlockchain] refresh error:", err);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Auto-mine trigger ──────────────────────────────────────────────────

  const scheduleAutoMine = useCallback(() => {
    if (autoMineTimer.current) return;
    autoMineTimer.current = setTimeout(async () => {
      autoMineTimer.current = null;
      const bc = await getClientBlockchain();
      if (bc.getPending().length === 0) return;
      setState((prev) => ({ ...prev, isMining: true }));
      try {
        const block = await bc.minePending();
        if (block) {
          setState((prev) => ({
            ...prev,
            blocks: bc.getBlocks(),
            pending: bc.getPending(),
            lastMinedBlock: block,
          }));
        }
      } finally {
        setState((prev) => ({ ...prev, isMining: false }));
      }
    }, 5_000); // auto-mine 5 s after last transaction
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────

  const addTransaction = useCallback(
    async (
      sender: string,
      recipient: string,
      payload: string,
      type: string,
    ): Promise<number> => {
      const bc = await getClientBlockchain();
      const blockIndex = await bc.addTransaction(sender, recipient, payload, type);
      await refresh();
      scheduleAutoMine();
      return blockIndex;
    },
    [refresh, scheduleAutoMine],
  );

  const mine = useCallback(async (): Promise<Block | null> => {
    setState((prev) => ({ ...prev, isMining: true }));
    try {
      const bc = await getClientBlockchain();
      const block = await bc.minePending();
      if (block) {
        setState((prev) => ({
          ...prev,
          blocks: bc.getBlocks(),
          pending: bc.getPending(),
          lastMinedBlock: block,
        }));
      }
      return block;
    } finally {
      setState((prev) => ({ ...prev, isMining: false }));
    }
  }, []);

  const verifyMessage = useCallback(async (msgHash: string) => {
    const bc = await getClientBlockchain();
    return bc.verifyMessage(msgHash);
  }, []);

  const syncChain = useCallback(
    async (incomingChain: Block[]): Promise<boolean> => {
      const bc = await getClientBlockchain();
      const adopted = await bc.syncChain(incomingChain);
      if (adopted) await refresh();
      return adopted;
    },
    [refresh],
  );

  const hashMessage = useCallback(async (message: string): Promise<string> => {
    const bc = await getClientBlockchain();
    return bc.hashMessage(message);
  }, []);

  return {
    ...state,
    addTransaction,
    mine,
    verifyMessage,
    syncChain,
    hashMessage,
    refresh,
  };
}
