# Nexus Chat Architecture in Nexus Community

The Nexus Community platform implements a decentralized chat architecture. Real-time messaging, encryption, and related API routes run on the **Node API** (`apps/node-api`) with Socket.IO and REST endpoints.

## 1. Architecture Overview

The Next.js frontend handles the user interface, while the Node API handles real-time messaging and encryption. Optional P2P delivery uses WebRTC via `@repo/p2p` and the signaling relay.

```
Frontend (Next.js)  ──HTTP/WS──►  Node API (REST + Socket.IO)
                                        │
                                        ├── PostgreSQL (Shared with Prisma)
                                        ├── AES-256-GCM Encryption
                                        └── WebRTC P2P (via signaling relay)
```

## 2. Real-Time Communication

The Next.js frontend communicates with the Node API via **WebSockets (Socket.IO)** and standard HTTP REST endpoints.

- The frontend uses the shared API contract exposed by `apps/node-api`.
- The Node API manages WebSocket events like `join-channel`, `leave-channel`, and message broadcasting (`chat:{id}:messages`).
- P2P text delivery can bypass the server for live messages when peers are connected on the same channel or DM.

## 3. AES-256-GCM Encryption (At Rest)

Before any message is saved to the shared PostgreSQL database, it is encrypted:

- Each channel or conversation generates a **unique AES key** derived using PBKDF2.
- Messages are encrypted using **AES-256-GCM** before being written to the database.
- The database only stores encrypted JSON payloads.
- Messages are decrypted on-the-fly by the backend when served to authenticated users.

## 4. Shared Persistent Storage

Both the Next.js frontend (via Prisma) and the Node API connect to the same **PostgreSQL** database.

- The Next.js app handles user management, authentication (via Clerk), and rendering.
- The Node API handles message encryption, Socket.IO connections, and encrypted storage in PostgreSQL.

## Summary of the Data Flow

1. **Send**: A user sends a message from the Next.js frontend.
2. **Process**: The Node API receives the message via Socket.IO (or P2P mesh for connected peers).
3. **Encrypt**: The backend encrypts the message using AES-256-GCM.
4. **Store**: The encrypted message is saved into PostgreSQL.
5. **Broadcast**: The backend broadcasts the decrypted message via Socket.IO and/or P2P to connected users in the channel.

The Node API provides the server-backed chat infrastructure alongside optional P2P paths in `@repo/p2p`.
