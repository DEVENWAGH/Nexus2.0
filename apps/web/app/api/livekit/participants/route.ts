/**
 * /api/livekit/participants — Removed. LiveKit has been replaced by native P2P WebRTC.
 * Returns 410 Gone. Participant presence is now tracked via the signaling server WebSocket.
 */

import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        {
            error: "LiveKit participant service removed. Active participants are tracked via the P2P signaling server.",
            signalingUrl: process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:3001",
        },
        { status: 410 },
    );
}
