import { verifyToken } from "@clerk/backend";
import type { Context, Next } from "hono";

const DEV_MODE = process.env.NODE_ENV !== "production";

type AppEnv = {
    Variables: {
        userId: string;
    };
};

export async function getUserIdFromRequest(c: Context): Promise<string | null> {
    const xUserId = c.req.header("X-User-Id");
    if (DEV_MODE && xUserId) {
        return xUserId;
    }

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
            const payload = await verifyToken(token, {
                secretKey: process.env.CLERK_SECRET_KEY,
            });
            return payload.sub ?? null;
        } catch {
            // fall through
        }
    }

    if (DEV_MODE) {
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
