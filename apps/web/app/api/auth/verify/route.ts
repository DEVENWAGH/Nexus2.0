import { NextResponse } from "next/server";

const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const upstream = await fetch(`${BACKEND_URL}/api/profile/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await upstream.json();
        if (!upstream.ok || !data?.success || !data?.token) {
            return NextResponse.json(
                { error: data?.error || "Authentication failed" },
                { status: upstream.status || 400 },
            );
        }

        const response = NextResponse.json({
            success: true,
            profile: data.profile,
        });

        response.cookies.set("__session", data.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
            sameSite: "lax",
        });

        return response;
    } catch (error) {
        console.error("[api/auth/verify]", error);
        return NextResponse.json(
            { error: "Authentication failed" },
            { status: 500 },
        );
    }
}
