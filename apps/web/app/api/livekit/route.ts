/**
 * /api/livekit — Removed. LiveKit has been replaced by native P2P WebRTC.
 * Returns 410 Gone for any clients that may still try to fetch a token.
 */

import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json(
        {
            error: "LiveKit has been removed. Voice/video is now P2P WebRTC via the signaling server.",
            signalingUrl: process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:3001",
        },
        { status: 410 },
    );
}

export async function POST() {
    return NextResponse.json(
        {
            error: "LiveKit has been removed. Voice/video is now P2P WebRTC via the signaling server.",
            signalingUrl: process.env.NEXT_PUBLIC_SIGNALING_URL ?? "ws://localhost:3001",
        },
        { status: 410 },
    );
}
