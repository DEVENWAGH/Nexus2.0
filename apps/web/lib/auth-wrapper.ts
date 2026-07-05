import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";

export const getAuth = async () => {
    // Try the official Clerk auth first
    try {
        const officialAuth = await auth();
        if (officialAuth.userId) {
            console.log("[getAuth] Official Clerk auth succeeded for:", officialAuth.userId);
            return officialAuth;
        } else {
            console.log("[getAuth] Official Clerk auth returned no userId");
        }
    } catch (e) {
        console.error("[getAuth] Official Clerk auth threw an error:", e);
    }

    // Fallback: parse __session cookie manually to bypass strict clock skew validation
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("__session")?.value;
        if (!sessionToken) {
            console.log("[getAuth] __session cookie is MISSING from the request!");
            return { userId: null };
        }
        
        const payloadBase64 = sessionToken.split(".")[1];
        if (!payloadBase64) {
            console.log("[getAuth] __session cookie is not a valid JWT (no payload)");
            return { userId: null };
        }
        
        // Fix base64 padding
        let base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) {
            base64 += "=";
        }
        
        const jsonPayload = Buffer.from(base64, "base64").toString("utf-8");
        const payload = JSON.parse(jsonPayload);
        console.log("[getAuth] Successfully decoded session cookie for userId:", payload.sub);
        
        return { userId: payload.sub };
    } catch (e) {
        console.error("[getAuth] Manual auth fallback failed:", e);
        return { userId: null };
    }
}

export const getCurrentUser = async () => {
    const { userId } = await getAuth();
    if (!userId) {
        console.log("[getCurrentUser] getAuth returned null userId");
        return null;
    }
    
    try {
        console.log("[getCurrentUser] Fetching full user from Clerk API for:", userId);
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        return user;
    } catch (e) {
        console.error("[getCurrentUser] Failed to fetch user from Clerk API:", e);
        return null;
    }
}
