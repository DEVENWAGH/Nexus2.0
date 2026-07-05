import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const room = req.nextUrl.searchParams.get("room");
    const identity = req.nextUrl.searchParams.get("identity");
    const name = req.nextUrl.searchParams.get("name") || identity;
    const avatar = req.nextUrl.searchParams.get("avatar");

    if (!room) {
        return NextResponse.json(
            { error: 'Missing "room" query parameter' },
            { status: 400 },
        );
    } else if (!identity) {
        return NextResponse.json(
            { error: 'Missing "identity" query parameter' },
            { status: 400 },
        );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
        console.error("Missing LiveKit environment variables:", {
            apiKey: !!apiKey,
            apiSecret: !!apiSecret,
            wsUrl: !!wsUrl,
        });
        return NextResponse.json(
            { error: "Server misconfigured" },
            { status: 500 },
        );
    }
    try {
        const at = new AccessToken(apiKey, apiSecret, {
            identity: identity,
            name: name || undefined,
            metadata: avatar ? JSON.stringify({ avatar }) : undefined,
        });

        at.addGrant({
            room,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();
        return NextResponse.json({ token });
    } catch (error) {
        console.error("Error generating LiveKit token:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
