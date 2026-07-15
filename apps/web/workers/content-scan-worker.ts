/// <reference lib="webworker" />

import { pipeline, env } from "@huggingface/transformers";
import { evaluateContentRules } from "../lib/content-rules";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "TaiwoOgun/minilm-hate-speech-onnx";
const MAX_TEXT_LENGTH = 4096;

type ScanRequest = {
    type: "scan";
    requestId: string;
    text: string;
    skipOnnx?: boolean;
};

type InitRequest = {
    type: "init";
    requestId: string;
};

type WorkerRequest = ScanRequest | InitRequest;

type ScanResponse = {
    type: "result";
    requestId: string;
    suspicious: boolean;
    score: number;
    label: "safe" | "suspicious" | "malicious";
    reasons: string[];
    source: "rules" | "onnx" | "rules+onnx";
};

type ErrorResponse = {
    type: "error";
    requestId: string;
    message: string;
    fallbackUsed: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let classifier: any = null;
let onnxAvailable = true;

async function ensureClassifier() {
    if (classifier || !onnxAvailable) return classifier;
    classifier = await pipeline("text-classification", MODEL_ID);
    return classifier;
}

function normalizeText(text: string): string {
    return text.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

async function runScan(text: string, skipOnnx?: boolean): Promise<Omit<ScanResponse, "requestId">> {
    const normalized = normalizeText(text);
    const rules = evaluateContentRules(normalized);
    let score = 0;
    let label: ScanResponse["label"] = "safe";
    let source: ScanResponse["source"] = "rules";
    const reasons = [...rules.reasons];

    if (!skipOnnx && onnxAvailable && normalized.length > 0) {
        try {
            const model = await ensureClassifier();
            if (model) {
                const output = await model(normalized);
                const top = Array.isArray(output) ? output[0] : output;
                const modelLabel = String(top?.label ?? "safe").toLowerCase();
                score = Number(top?.score ?? 0);
                if (modelLabel.includes("hate") && score >= 0.85) {
                    label = "malicious";
                    reasons.push(`ONNX flagged hate speech (${(score * 100).toFixed(1)}%)`);
                } else if (modelLabel.includes("hate") && score >= 0.6) {
                    label = "suspicious";
                    reasons.push(`ONNX flagged suspicious content (${(score * 100).toFixed(1)}%)`);
                }
                source = rules.suspicious ? "rules+onnx" : "onnx";
            }
        } catch (error) {
            onnxAvailable = false;
            console.warn("[content-scan-worker] ONNX unavailable, rules-only fallback:", error);
        }
    }

    if (rules.suspicious && label === "safe") {
        label = "suspicious";
    }

    return {
        type: "result",
        suspicious: rules.suspicious || label !== "safe",
        score,
        label,
        reasons,
        source,
    };
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
    const data = event.data;
    try {
        if (data.type === "init") {
            await ensureClassifier();
            const response: ScanResponse = {
                ...(await runScan("hello", true)),
                requestId: data.requestId,
            };
            self.postMessage(response);
            return;
        }

        if (data.type === "scan") {
            const result = await runScan(data.text, data.skipOnnx);
            const response: ScanResponse = {
                ...result,
                requestId: data.requestId,
            };
            self.postMessage(response);
            return;
        }
    } catch (error) {
        const response: ErrorResponse = {
            type: "error",
            requestId: data.requestId,
            message: error instanceof Error ? error.message : "Scan failed",
            fallbackUsed: true,
        };
        self.postMessage(response);
    }
});
