import { NextResponse } from "next/server";

const BACKEND_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const upstream = await fetch(`${BACKEND_URL}/api/profile/nonce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await upstream.json();
        return NextResponse.json(data, { status: upstream.status });
    } catch (error) {
        console.error("[api/auth/nonce]", error);
        return NextResponse.json(
            { error: "Failed to request authentication challenge" },
            { status: 500 },
        );
    }
}
