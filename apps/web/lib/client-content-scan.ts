"use client";

import { evaluateContentRules, shouldRequireConfirmation, type ContentRulesResult } from "./content-rules";

export type ScanResult = {
    suspicious: boolean;
    score: number;
    label: "safe" | "suspicious" | "malicious";
    reasons: string[];
    source: "rules" | "onnx" | "rules+onnx";
    rules: ContentRulesResult;
};

type WorkerResultMessage = {
    type: "result";
    requestId: string;
    suspicious: boolean;
    score: number;
    label: ScanResult["label"];
    reasons: string[];
    source: ScanResult["source"];
};

type WorkerErrorMessage = {
    type: "error";
    requestId: string;
    message: string;
    fallbackUsed: boolean;
};

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
const cache = new Map<string, { result: ScanResult; expiresAt: number }>();

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL("../workers/content-scan-worker.ts", import.meta.url), {
            type: "module",
        });
    }
    return worker;
}

function hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
    }
    return `${hash}:${text.length}`;
}

async function ensureInitialized(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
        const requestId = crypto.randomUUID();
        const w = getWorker();
        const onMessage = (event: MessageEvent<WorkerResultMessage | WorkerErrorMessage>) => {
            if (event.data.requestId !== requestId) return;
            w.removeEventListener("message", onMessage);
            resolve();
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ type: "init", requestId });
        setTimeout(() => {
            w.removeEventListener("message", onMessage);
            resolve();
        }, 15000);
    });
    return initPromise;
}

function rulesOnlyScan(text: string): ScanResult {
    const rules = evaluateContentRules(text);
    const suspicious = shouldRequireConfirmation(rules);
    return {
        suspicious,
        score: 0,
        label: suspicious ? "suspicious" : "safe",
        reasons: rules.reasons,
        source: "rules",
        rules,
    };
}

export async function scanText(text: string): Promise<ScanResult> {
    const key = hashText(text);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }

    const rules = evaluateContentRules(text);
    if (text.length > 4096) {
        const result = rulesOnlyScan(text);
        cache.set(key, { result, expiresAt: Date.now() + 5 * 60_000 });
        return result;
    }

    try {
        await ensureInitialized();
        const requestId = crypto.randomUUID();
        const w = getWorker();

        const result = await new Promise<ScanResult>((resolve, reject) => {
            const timeout = setTimeout(() => {
                w.removeEventListener("message", onMessage);
                resolve(rulesOnlyScan(text));
            }, 10000);

            const onMessage = (event: MessageEvent<WorkerResultMessage | WorkerErrorMessage>) => {
                if (event.data.requestId !== requestId) return;
                clearTimeout(timeout);
                w.removeEventListener("message", onMessage);

                if (event.data.type === "error") {
                    resolve(rulesOnlyScan(text));
                    return;
                }

                const payload = event.data;
                const merged: ScanResult = {
                    suspicious: payload.suspicious || rules.suspicious,
                    score: payload.score,
                    label: payload.label,
                    reasons: [...new Set([...rules.reasons, ...payload.reasons])],
                    source: payload.source,
                    rules,
                };
                resolve(merged);
            };

            w.addEventListener("message", onMessage);
            w.postMessage({ type: "scan", requestId, text });
        });

        cache.set(key, { result, expiresAt: Date.now() + 5 * 60_000 });
        return result;
    } catch {
        const result = rulesOnlyScan(text);
        cache.set(key, { result, expiresAt: Date.now() + 5 * 60_000 });
        return result;
    }
}

export function requiresSendConfirmation(result: ScanResult): boolean {
    return shouldRequireConfirmation(result.rules, result.score, result.label);
}
