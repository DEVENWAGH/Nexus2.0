# @repo/p2p — Decentralized messaging layer

Browser-first P2P mesh over **WebRTC data channels** with a **lightweight signaling server** (SDP/ICE relay only — no message storage).

## Architecture

```
Browser A  ←—— WebRTC DataChannel ——→  Browser B
     \                                    /
      \—— WebSocket signaling (join/SDP) —/
                    |
            apps/signaling-server
         (relay only, no message hub)
```

## Postgres vs P2P

| Data | Storage |
|------|---------|
| User profiles, servers, channels, memberships | **Postgres** (wallet auth + Prisma) |
| Real-time chat delivery | **P2P WebRTC** with bounded gossip relay (this package) |
| Message history (optional) | Local IndexedDB / future CRDT — **not** signaling server |
| File uploads | UploadThing CDN (centralized asset host) |
| Voice/video | LiveKit (centralized SFU) |

## Run locally

```bash
# Terminal 1 — Node API + signaling relay
yarn dev:backend

# Terminal 2 — Next.js frontend
yarn dev

# Open a text channel or DM in two browser tabs (same channel or conversation)
# P2P delivery is wired through P2PChatBridge in the main app
```

## Encryption

`encryption.ts` implements PBKDF2 + AES-256-GCM (same algorithm as the Node API). Set `ENCRYPTION_MASTER_KEY` in env for production.

## Migration path

1. **Done**: Signaling server + WebRTC mesh + AES-GCM in TypeScript
2. **Done**: Wire DMs and text channels to `P2PMesh` via `P2PChatBridge`
3. **Next**: Wire server/channel REST via Node API + Postgres
4. **Done**: Bounded multi-hop gossip relay with seen-cache, TTL, and relay rate limits
5. **Later**: libp2p for NAT traversal / offline peer discovery
6. **Later**: Optional IPFS or CRDT for encrypted message history sync
