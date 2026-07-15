import { cookies } from "next/headers";
import { prisma } from "@repo/db";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "nexus-fallback-secret-key-321";

function verifyJWT(token: string, secret: string): any | null {
    try {
        const [headerB64, payloadB64, signatureB64] = token.split(".");
        if (!headerB64 || !payloadB64 || !signatureB64) return null;

        // Fix base64url signature comparison
        const data = `${headerB64}.${payloadB64}`;
        const calculatedSignature = crypto
            .createHmac("sha256", secret)
            .update(data)
            .digest("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        // Compare signatures securely
        if (calculatedSignature !== signatureB64) {
            console.log("[verifyJWT] Signature verification failed!");
            return null;
        }

        // Decode payload
        let base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) base64 += "=";
        const jsonPayload = Buffer.from(base64, "base64").toString("utf-8");
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("[verifyJWT] Error:", e);
        return null;
    }
}

export const getAuth = async () => {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("__session")?.value;
        if (!sessionToken) {
            return { userId: null };
        }

        const payload = verifyJWT(sessionToken, JWT_SECRET);
        if (!payload || !payload.sub) {
            return { userId: null };
        }

        return { userId: payload.sub as string };
    } catch (e) {
        console.error("[getAuth] Custom auth failed:", e);
        return { userId: null };
    }
};

export const getCurrentUser = async () => {
    const { userId } = await getAuth();
    if (!userId) {
        return null;
    }

    try {
        const profile = await prisma.profile.findUnique({
            where: { userId },
        });

        if (!profile) {
            return null;
        }

        // Return a shape that matches Clerk's user object for backward compatibility
        return {
            id: profile.userId,
            firstName: profile.name.split(" ")[0] || "",
            lastName: profile.name.split(" ").slice(1).join(" ") || "",
            imageUrl: profile.imageUrl,
            emailAddresses: [{ emailAddress: profile.email }],
        };
    } catch (e) {
        console.error("[getCurrentUser] Failed to fetch user from DB:", e);
        return null;
    }
};
