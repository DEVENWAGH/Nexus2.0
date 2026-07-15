/**
 * blockchain-worker.ts — Dedicated Web Worker for Proof-of-Work mining.
 *
 * Runs SHA-256 hashing in a tight loop to find a proof value whose combined
 * hash with the last proof produces 4 leading zero hex digits.
 * This offloads the CPU-intensive PoW loop off the main UI thread.
 *
 * Message protocol:
 *   IN:  { type: "mine", lastProof: number, requestId: string }
 *   OUT: { type: "result", proof: number, requestId: string }
 *        { type: "hash",   value: string,  requestId: string }  ← SHA-256 utility
 *   IN:  { type: "hash",  data: string,   requestId: string }
 */

/// <reference lib="webworker" />

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validProof(lastProof: number, proof: number): Promise<boolean> {
  const hash = await sha256Hex(`${lastProof}${proof}`);
  return hash.startsWith("0000");
}

async function proofOfWork(lastProof: number): Promise<number> {
  let proof = 0;
  while (!(await validProof(lastProof, proof))) {
    proof++;
  }
  return proof;
}

self.addEventListener("message", async (event: MessageEvent) => {
  const msg = event.data as
    | { type: "mine"; lastProof: number; requestId: string }
    | { type: "hash"; data: string; requestId: string };

  if (msg.type === "mine") {
    const proof = await proofOfWork(msg.lastProof);
    self.postMessage({ type: "result", proof, requestId: msg.requestId });
  } else if (msg.type === "hash") {
    const value = await sha256Hex(msg.data);
    self.postMessage({ type: "hash", value, requestId: msg.requestId });
  }
});
