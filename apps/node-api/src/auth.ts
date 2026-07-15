import { verifySessionToken } from "@repo/auth";
import type { Context, Next } from "hono";

type AppEnv = {
    Variables: {
        userId: string;
    };
};

export async function getUserIdFromRequest(c: Context): Promise<string | null> {
    let authHeader = c.req.header("Authorization");
    if (!authHeader) {
        const cookie = c.req.header("Cookie") ?? "";
        const match = cookie.match(/__session=([^;]+)/);
        if (match) {
            authHeader = `Bearer ${match[1]}`;
        }
    }

    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const claims = await verifySessionToken(token);
        return claims?.sub ?? null;
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
