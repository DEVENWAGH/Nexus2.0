import { describe, expect, it } from "vitest";
import {
    JWT_ISSUER,
    SESSION_AUDIENCE,
    signSessionToken,
    verifySessionToken,
} from "./index";

describe("@repo/auth session tokens", () => {
    const originalSecret = process.env.JWT_SECRET;

    it("signs and verifies a session token", async () => {
        process.env.JWT_SECRET = "test-secret-key-123456";
        process.env.NODE_ENV = "test";
        const token = await signSessionToken("0xabc123");
        const claims = await verifySessionToken(token);
        expect(claims?.sub).toBe("0xabc123");
        process.env.JWT_SECRET = originalSecret;
    });

    it("rejects tampered tokens", async () => {
        process.env.JWT_SECRET = "test-secret-key-123456";
        process.env.NODE_ENV = "test";
        const token = await signSessionToken("0xabc123");
        const claims = await verifySessionToken(`${token}x`);
        expect(claims).toBeNull();
        process.env.JWT_SECRET = originalSecret;
    });

    it("exports stable issuer and audience constants", () => {
        expect(JWT_ISSUER).toBe("nexus");
        expect(SESSION_AUDIENCE).toBe("nexus-session");
    });
});
