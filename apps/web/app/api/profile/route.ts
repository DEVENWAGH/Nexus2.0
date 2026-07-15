import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-wrapper";
import { prisma } from "@repo/db";

export async function GET() {
    try {
        const { userId } = await getAuth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const profile = await prisma.profile.findUnique({
            where: { userId },
        });

        if (!profile) {
            return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        return NextResponse.json(profile);
    } catch (error) {
        console.error("[api/profile] GET failed:", error);
        return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }
}
