import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const JWT_ISSUER = "nexus";
export const SESSION_AUDIENCE = "nexus-session";
export const SIGNALING_AUDIENCE = "nexus-signaling";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SIGNALING_TTL_SECONDS = 5 * 60;

const DEV_FALLBACK_SECRET = "nexus-dev-jwt-secret-change-me";

function getSecretKey(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length >= 16) {
        return new TextEncoder().encode(secret);
    }

    if (process.env.NODE_ENV === "production") {
        throw new Error("JWT_SECRET must be set and at least 16 characters");
    }

    console.warn(
        "[auth] JWT_SECRET missing or too short — using development fallback. Set JWT_SECRET in .env.",
    );
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
}

export type SessionClaims = {
    sub: string;
};

export type SignalingClaims = SessionClaims & {
    roomId: string;
    peerId: string;
};

export async function signSessionToken(userId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(JWT_ISSUER)
        .setAudience(SESSION_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + SESSION_TTL_SECONDS)
        .sign(getSecretKey());
}

export async function verifySessionToken(
    token: string,
): Promise<SessionClaims | null> {
    try {
        const { payload } = await jwtVerify(token, getSecretKey(), {
            issuer: JWT_ISSUER,
            audience: SESSION_AUDIENCE,
            algorithms: ["HS256"],
        });
        if (!payload.sub) return null;
        return { sub: payload.sub };
    } catch {
        return null;
    }
}

export async function signSignalingTicket(
    claims: SignalingClaims,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        roomId: claims.roomId,
        peerId: claims.peerId,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuer(JWT_ISSUER)
        .setAudience(SIGNALING_AUDIENCE)
        .setIssuedAt(now)
        .setExpirationTime(now + SIGNALING_TTL_SECONDS)
        .sign(getSecretKey());
}

export async function verifySignalingTicket(
    token: string,
    roomId: string,
    peerId: string,
): Promise<SessionClaims | null> {
    try {
        const { payload } = await jwtVerify(token, getSecretKey(), {
            issuer: JWT_ISSUER,
            audience: SIGNALING_AUDIENCE,
            algorithms: ["HS256"],
        });
        if (!payload.sub) return null;
        if (payload.roomId !== roomId || payload.peerId !== peerId) {
            return null;
        }
        return { sub: payload.sub };
    } catch {
        return null;
    }
}

export function normalizeWalletAddress(
    address: string,
    walletType: "evm" | "solana",
): string {
    const trimmed = address.trim();
    if (walletType === "evm") {
        return trimmed.toLowerCase();
    }
    return trimmed;
}

export function nonceKey(address: string, walletType: "evm" | "solana"): string {
    return `${walletType}:${normalizeWalletAddress(address, walletType)}`;
}
