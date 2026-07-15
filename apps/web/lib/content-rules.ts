export type RuleSeverity = "warning" | "critical";

export type ContentRuleMatch = {
    ruleId: string;
    severity: RuleSeverity;
    reason: string;
};

export type ContentRulesResult = {
    suspicious: boolean;
    matches: ContentRuleMatch[];
    reasons: string[];
};

const KEYWORD_RULES: Array<{ id: string; pattern: RegExp; reason: string }> = [
    { id: "keyword-hack", pattern: /\bhack\b/i, reason: "Suspicious keyword: hack" },
    { id: "keyword-exploit", pattern: /\bexploit\b/i, reason: "Suspicious keyword: exploit" },
    { id: "keyword-inject", pattern: /\binject\b/i, reason: "Suspicious keyword: inject" },
    { id: "keyword-drop-table", pattern: /drop\s+table/i, reason: "Suspicious keyword: drop table" },
    { id: "keyword-rm-rf", pattern: /rm\s+-rf/i, reason: "Suspicious keyword: rm -rf" },
    { id: "keyword-script", pattern: /<script\b/i, reason: "Suspicious keyword: script tag" },
    { id: "keyword-eval", pattern: /\beval\s*\(/i, reason: "Suspicious keyword: eval(" },
    { id: "keyword-exec", pattern: /\bexec\s*\(/i, reason: "Suspicious keyword: exec(" },
    { id: "keyword-malware", pattern: /\bmalware\b/i, reason: "Suspicious keyword: malware" },
    { id: "keyword-virus", pattern: /\bvirus\b/i, reason: "Suspicious keyword: virus" },
];

const INJECTION_RULES: Array<{ id: string; pattern: RegExp; reason: string }> = [
    {
        id: "injection-shell",
        pattern: /\b(exec|eval|base64_decode|system|shell_exec)\b/i,
        reason: "Potential code injection payload detected",
    },
];

export function evaluateContentRules(text: string): ContentRulesResult {
    const matches: ContentRuleMatch[] = [];

    for (const rule of [...INJECTION_RULES, ...KEYWORD_RULES]) {
        if (rule.pattern.test(text)) {
            matches.push({
                ruleId: rule.id,
                severity: "warning",
                reason: rule.reason,
            });
        }
    }

    if (text.length > 65536) {
        matches.push({
            ruleId: "oversized-payload",
            severity: "warning",
            reason: "Oversized message payload (potential flood attack)",
        });
    }

    if (/(.)\1{100,}/.test(text)) {
        matches.push({
            ruleId: "repetition-flood",
            severity: "warning",
            reason: "Repetitive pattern detected (potential DoS flooding)",
        });
    }

    const reasons = matches.map((m) => m.reason);
    return {
        suspicious: matches.length > 0,
        matches,
        reasons,
    };
}

export function shouldRequireConfirmation(
    rules: ContentRulesResult,
    onnxScore?: number,
    onnxLabel?: string,
): boolean {
    if (rules.suspicious) return true;
    if (onnxLabel === "hate" && (onnxScore ?? 0) >= 0.6) return true;
    return false;
}
