import { verify } from "hono/jwt";
import type { Context, Next } from "hono";

const DEV_MODE = process.env.NODE_ENV !== "production";
const JWT_SECRET = process.env.JWT_SECRET || "nexus-fallback-secret-key-321";

type AppEnv = {
    Variables: {
        userId: string;
    };
};

export async function getUserIdFromRequest(c: Context): Promise<string | null> {
    // 1. First prioritize verified JWT token from Cookie or Authorization header
    let authHeader = c.req.header("Authorization");
    if (!authHeader) {
        const cookie = c.req.header("Cookie") ?? "";
        const match = cookie.match(/__session=([^;]+)/);
        if (match) {
            authHeader = `Bearer ${match[1]}`;
        }
    }

    if (authHeader?.startsWith("Bearer ")) {
        try {
            const token = authHeader.slice(7);
            const payload = await verify(token, JWT_SECRET, "HS256");
            if (payload?.sub) {
                return payload.sub as string;
            }
        } catch (e) {
            console.error("[auth] JWT verification failed:", e);
        }
    }

    // 2. Fall back to X-User-Id only if not a DID and in dev mode
    const xUserId = c.req.header("X-User-Id");
    if (DEV_MODE && xUserId && !xUserId.startsWith("did:key:")) {
        return xUserId;
    }

    // Optional local bypass only when explicitly enabled (avoids fake-user 404s on /api/profile)
    if (DEV_MODE && process.env.DEV_AUTH_BYPASS === "true") {
        return "dev_user_001";
    }

    return null;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
    const userId = await getUserIdFromRequest(c);
    if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("userId", userId);
    await next();
}
