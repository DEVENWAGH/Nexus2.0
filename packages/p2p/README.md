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

## OrbitDB vs P2P

| Data | Storage |
|------|---------|
| User profiles, servers, channels, memberships | **OrbitDB** (via Prisma HTTP Proxy) |
| Real-time chat delivery | **P2P WebRTC** (this package) |
| Message history (optional) | Local IndexedDB / future CRDT — **not** signaling server |
| File uploads | **P2P DataChannel** (32KB chunks) / **Pinata IPFS** |
| Voice/video | **Native WebRTC P2P Mesh** via signaling relay |

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
3. **Next**: Wire server/channel REST via Node API + OrbitDB
4. **Later**: libp2p for NAT traversal / offline peer discovery
5. **Later**: Optional IPFS or CRDT for encrypted message history sync
