import { RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const room = req.nextUrl.searchParams.get("room");
    if (!room) {
        return NextResponse.json(
            { error: 'Missing "room" query parameter' },
            { status: 400 },
        );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
        console.error("Missing LiveKit environment variables for participant service");
        return NextResponse.json(
            { error: "Server misconfigured" },
            { status: 500 },
        );
    }

    // Convert ws/wss connection string to http/https for the REST client
    const host = wsUrl.replace("wss://", "https://").replace("ws://", "http://");

    try {
        const roomService = new RoomServiceClient(host, apiKey, apiSecret);
        const participants = await roomService.listParticipants(room);

        const list = participants.map((p) => {
            let avatar = "";
            if (p.metadata) {
                try {
                    const parsed = JSON.parse(p.metadata);
                    avatar = parsed.avatar || "";
                } catch {
                    // Fallback in case metadata is a simple string URL
                    avatar = p.metadata;
                }
            }
            return {
                name: p.name || p.identity,
                avatar,
            };
        });

        return NextResponse.json({ participants: list });
    } catch (error) {
        console.error("Error listing room participants:", error);
        // If room does not exist yet (no active calls), it returns an error; handle gracefully
        return NextResponse.json({ participants: [] });
    }
}
