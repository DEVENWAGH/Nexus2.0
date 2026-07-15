import { cookies } from "next/headers";
import { prisma } from "@repo/db";
import { verifySessionToken } from "@repo/auth";

export const getAuth = async () => {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get("__session")?.value;
        if (!sessionToken) {
            return { userId: null };
        }

        const claims = await verifySessionToken(sessionToken);
        if (!claims?.sub) {
            return { userId: null };
        }

        return { userId: claims.sub };
    } catch (e) {
        console.error("[getAuth] Session verification failed:", e);
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
