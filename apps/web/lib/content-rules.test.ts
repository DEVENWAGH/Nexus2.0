import { describe, expect, it } from "vitest";
import { evaluateContentRules, shouldRequireConfirmation } from "./content-rules";

describe("content-rules", () => {
    it("flags injection patterns", () => {
        const result = evaluateContentRules("please eval(alert(1))");
        expect(result.suspicious).toBe(true);
        expect(result.reasons.some((r) => r.includes("injection"))).toBe(true);
    });

    it("flags oversized payloads", () => {
        const result = evaluateContentRules("a".repeat(70000));
        expect(result.suspicious).toBe(true);
    });

    it("requires confirmation for suspicious rules", () => {
        const rules = evaluateContentRules("drop table users");
        expect(shouldRequireConfirmation(rules)).toBe(true);
    });
});
