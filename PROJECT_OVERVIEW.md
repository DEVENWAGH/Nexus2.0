# Nexus Platform Overview & Feature Specification

Welcome to the comprehensive overview of the **Nexus Community** platform. This document outlines the application architecture, system design, core features, security protocols, database models, and operational commands of the platform.

---

## 🧭 Executive Summary

**Nexus** is a state-of-the-art **hybrid secure communication platform** designed to combine the administrative utility of modern centralized team collaboration tools (like Discord/Slack) with the robust cryptographic privacy of a decentralized peer-to-peer (P2P) network. 

### Core Pillars
1. **Decentralized P2P Mesh Network**: Real-time serverless text channels and direct messaging (via WebRTC) with custom node identities.
2. **Proof-of-Work Blockchain Ledger**: A tamper-proof history verifier that validates message integrity and blocks rogue alterations.
3. **Security Watchdog & Steganography**: Strict 24-hour message expiration (self-destructing data), fake node (Sybil) watchdogs, and multi-media steganography to conceal confidential payloads within standard media.

---

## 🏗️ Architectural Topology

Nexus is structured as a Turborepo monorepo, orchestrating independent microservices and shared npm packages.

### Monorepo Structure

```text
├── apps/
│   ├── web/                 # Next.js 16 frontend application (React, Tailwind v4, Shadcn)
│   ├── node-api/            # Node.js backend API (Hono REST + Socket.io real-time engine)
│   └── signaling-server/    # WebRTC signaling relay server (SDP/ICE handshake coordinator)
├── packages/
│   ├── db/                  # Prisma client configurations & PostgreSQL schemas
│   ├── p2p/                 # P2P mesh logic, Web Crypto DID, AES-256-GCM engine, chunk-based file transfer client
│   ├── eslint-config/       # Shared linting standards
│   └── typescript-config/   # Shared typescript compilation rules
```

### Hybrid Data Flow Diagram

```mermaid
graph TD
    subgraph Client Node A (Browser)
        A_UI[Next.js UI] <--> A_State[Zustand & React Query]
        A_UI <--> A_P2P[P2P Mesh client / WebRTC]
        A_UI <--> A_DID[DID Keypair IndexedDB]
    end

    subgraph Client Node B (Browser)
        B_UI[Next.js UI] <--> B_P2P[P2P Mesh client / WebRTC]
    end

    subgraph Centralized Cloud & Backend
        NodeAPI[Node API Hono Server]
        Signaling[Signaling WebSocket Server]
        Postgres[(PostgreSQL Database)]
        UploadThing[UploadThing CDN]
        LiveKit[LiveKit SFU Server]
    end

    %% P2P Path
    A_P2P <-->|WebRTC Data Channel / AES-256-GCM| B_P2P
    A_P2P <-->|SDP / ICE Handshake| Signaling
    B_P2P <-->|SDP / ICE Handshake| Signaling

    %% Centralized Path
    A_UI <-->|HTTP REST / Socket.IO| NodeAPI
    NodeAPI <-->|AES-256-GCM Encrypted JSON| Postgres
    A_UI <-->|Media Upload| UploadThing
    A_UI <-->|SFU Voice & Video Calls| LiveKit
```

---

## 🛠️ Feature Specification & System Details

### 1. Centralized Workspace Features
* **Servers & Channels**: Users can create, customize, and manage collaborative servers. Inside each server, admins can configure **Text**, **Audio**, and **Video** channels.
* **Authentication**: Powered by **Clerk Auth**, providing secure registration, login, profile synchronization, and session management.
* **Voice & Video Conferencing**: High-performance, low-latency audio/video calls utilizing a **LiveKit SFU (Selective Forwarding Unit)** server.
* **Multimedia Uploads**: Handled via **UploadThing**, allowing users to upload and share images, PDFs, and media attachments directly in channels.

### 2. Decentralized P2P Mesh Network
* **WebRTC P2P Mesh**: Text channels and DMs support direct node-to-node messaging that bypasses backend databases entirely. Peer connections are managed in [p2p-mesh.ts](file:///c:/Users/Devil/Desktop/Nexus/packages/p2p/src/p2p-mesh.ts).
* **Signaling Relay**: A lightweight WebSocket server ([signaling-server](file:///c:/Users/Devil/Desktop/Nexus/apps/signaling-server)) acts as the SDP/ICE broker. It coordinates handshakes and does not store or read message content.
* **Incremental Chunk-Based File Transfer**: Files shared via WebRTC are sliced into **32KB** chunks, hashed with SHA-256 for verification, encrypted, and streamed directly between client memory heaps (managed in [file-transfer.ts](file:///c:/Users/Devil/Desktop/Nexus/packages/p2p/src/file-transfer.ts)). This completely bypasses intermediate servers.

### 3. Cryptographic Security & Identity
* **Decentralized Identifiers (DIDs)**: Each user node generates a W3C-compatible DID Keypair (`did:key:z<spki-hex>`) locally using ECDSA (P-256 curve) in [identity.ts](file:///c:/Users/Devil/Desktop/Nexus/packages/p2p/src/identity.ts). Private keys are securely sandboxed in the browser's IndexedDB (`nexus-identity`). Every P2P packet is cryptographically signed and verified by receiving nodes to prevent Sybil/impersonation attacks.
* **Application-Level Encryption**: 
  * **P2P Channel Payloads**: Encrypted end-to-end via WebRTC DTLS and further reinforced using **AES-256-GCM** with keys derived on-the-fly via PBKDF2 (parameterized by channel keys).
  * **Database-at-Rest**: All messages saved in PostgreSQL are encrypted in the Hono API server using **AES-256-GCM** before writing, ensuring that database leaks expose only ciphertext.
* **Proof-of-Work Blockchain Ledger**: The backend logs SHA-256 hashes of messages into a local Proof-of-Work blockchain [local-blockchain.ts](file:///c:/Users/Devil/Desktop/Nexus/apps/node-api/src/lib/local-blockchain.ts). Any manual or unauthorized DB manipulation breaks the hash chain, triggering tampering flags (ShieldCheck status indicators) in the UI.

### 4. Steganography Suite & Obfuscation
Nexus allows users to hide text payloads inside common media formats to avoid surveillance detection:
* **Image Steganography**: Encodes text in the Least Significant Bit (LSB) of the image's red channel.
* **Audio Steganography**: Appends encoded binary blocks to MP3 file envelopes.
* **Video Steganography**: Appends obfuscated data segments to MP4/WebM files.
* **PDF Steganography**: Injects text markers after the PDF EOF (`%%EOF`) character block.
* *All steganographic utilities are consolidated under [steganography.ts](file:///c:/Users/Devil/Desktop/Nexus/apps/node-api/src/lib/steganography.ts) and its specialized library drivers.*

### 5. Security Watchdog (Self-Destruct & Auditing)
* **24-Hour Message TTL**: Every channel message and direct message is marked with a 24-hour expiration (`expiresAt`).
* **Automated Cleanup**: A daily backend node-cron task runs at midnight (`00:00:00`) to hard-delete expired records from PostgreSQL.
* **Core Control Center**: A premium dashboard (located at `/servers/[serverId]/analytics` or `/admin`) built for server operators, featuring:
  * A live countdown timer to the next automatic watchdog purge.
  * System diagnostics showing blockchain blocks and node reputation counts.
  * Action panels for on-demand **blockchain mining** (mining pending ledger transactions) and **manual data purging** (sweeping expired records).
  * Fake Node Watchdog diagnostics alerting admins to failed P2P signature authentications.

---

## 🗄️ Database Schema & Relations

Nexus utilizes a PostgreSQL instance configured via Prisma. Below is a layout of the primary models defined in [schema.prisma](file:///c:/Users/Devil/Desktop/Nexus/packages/db/prisma/schema.prisma):

```mermaid
erDiagram
    Profile ||--o{ Server : "creates"
    Profile ||--o{ Member : "has"
    Profile ||--o{ Channel : "manages"
    Server ||--o{ Member : "has"
    Server ||--o{ Channel : "has"
    Member ||--o{ Message : "sends"
    Member ||--o{ DirectMessage : "sends"
    Member ||--o{ Conversation : "starts (MemberOne)"
    Member ||--o{ Conversation : "receives (MemberTwo)"
    Channel ||--o{ Message : "contains"
    Conversation ||--o{ DirectMessage : "contains"

    Profile {
        String id PK
        String userId UK
        String name
        String imageUrl
        String email
        DateTime createdAt
        DateTime updatedAt
    }
    Server {
        String id PK
        String name
        String imageUrl
        String inviteCode UK
        String profileId FK
        DateTime createdAt
        DateTime updatedAt
    }
    Member {
        String id PK
        MemberRole role
        String profileId FK
        String serverId FK
        DateTime createdAt
        DateTime updatedAt
    }
    Channel {
        String id PK
        String name
        ChannelType type
        String profileId FK
        String serverId FK
        DateTime createdAt
        DateTime updatedAt
    }
    Message {
        String id PK
        String content
        String fileUrl
        String memberId FK
        String channelId FK
        Boolean deleted
        DateTime expiresAt
        DateTime createdAt
        DateTime updatedAt
    }
    Conversation {
        String id PK
        String memberOneId FK
        String memberTwoId FK
    }
    DirectMessage {
        String id PK
        String content
        String fileUrl
        String memberId FK
        String conversationId FK
        Boolean deleted
        DateTime expiresAt
        DateTime createdAt
        DateTime updatedAt
    }
```

---

## 💻 Tech Stack Snapshot

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | Next.js 16 (App Router) | Core UI, layouts, SSR, and dynamic rendering |
| **Frontend Styling** | Tailwind CSS v4 & Shadcn/UI | Modern CSS variables, adaptive glassmorphism |
| **State & Fetching** | Zustand & React Query | Global state store and client data cache |
| **Authentication** | Clerk Auth | Multi-tenant auth, profile metadata synchronization |
| **Backend REST API** | Hono (NodeJS) | REST router, steganography engine, blockchain node |
| **Real-time Server** | Socket.IO (WebSockets) | Instant notifications, active member presence, WS relay |
| **WebRTC P2P** | Native browser RTCPeerConnection | Peer mesh, ephemeral channel syncing, client-side encryption |
| **Voice / Video Engine**| LiveKit | SFU conferencing for high-bandwidth audio & video channels |
| **ORM & Database** | Prisma + PostgreSQL | Relational storage at rest, database mappings |
| **Package Manager** | Yarn (v4 Berry) | Zero-install capability, workspace package resolution |
| **Monorepo Build** | Turborepo | Caching pipeline, parallel workspaces build engine |

---

## 🚀 Getting Started & Local Operations

### Prerequisites
* **Yarn** >= 4.0.0 (Yarn Berry)
* **Node.js** >= 18.0.0
* **PostgreSQL** database (local instance or Docker container)

### 1. Installation
Clone the repository and install workspace dependencies:
```bash
git clone https://github.com/ErArbazAnsari/nexus-community.git
cd nexus-community
yarn install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`).
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nexus?schema=public"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
UPLOADTHING_TOKEN="60_..."
NEXT_PUBLIC_LIVEKIT_URL="wss://..."
LIVEKIT_API_KEY="..."
LIVEKIT_API_SECRET="..."
NEXT_PUBLIC_SOCKET_URL="http://localhost:8000"
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_SIGNALING_URL="ws://localhost:3001"
ENCRYPTION_MASTER_KEY="your-super-secret-key-32-chars-long"
```

### 3. Database Initialization
```bash
# Start PostgreSQL via docker-compose (optional fallback)
docker-compose up -d postgres

# Generate Prisma client and push the schema
yarn db:generate
yarn db:push
```

### 4. Running the Dev Servers
You will need two active terminal sessions to run the frontend and backend microservices:

* **Terminal 1: Node API Server & Signaling Relay**
  ```bash
  yarn dev:backend
  ```
  * *REST API & WebSockets live on: `http://localhost:8000`*
  * *P2P Signaling WS server lives on: `ws://localhost:3001`*

* **Terminal 2: Next.js Frontend App**
  ```bash
  yarn dev
  ```
  * *Web App client lives on: `http://localhost:3000`*

---

## 📈 System Diagnostics & Control Dashboard

To access the Core Control Center, log into the web application, navigate to any Server, and select the **Analytics** option or go directly to the `/admin` route.

* **Mine Transactions**: When messages are sent, their hashes enter a mempool. Trigger **Mine Now** to perform Proof-of-Work and append them to the local ledger block list.
* **Database Sweeper**: Trigger **Run Purge** to immediately delete messages that have crossed their 24-hour expiration window.
* **Security Watchdog Count**: Monitors active node sizes, verification counts, and blacklisted fake nodes in real-time.
