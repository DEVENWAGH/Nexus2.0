# Nexus Core Control Center Guide

Welcome to the **Nexus Core Control Center**, the administrative and operational dashboard of the Nexus system. Nexus is built on a resilient, high-security architecture driven by three core pillars:

1. **Decentralized Mesh Network**
2. **Blockchain Ledger**
3. **Security Watchdog (Self-Destruct & Auditing)**

This guide explains what the Control Center is, how its primary systems work under the hood, and how to utilize and configure it.

---

## 🧭 What is the Nexus Core Control Center?

The Control Center (accessible at `/admin`) is a premium real-time operations dashboard designed to monitor and manage the Nexus peer-to-peer workspace. It provides:

*   **Real-time Ledger Monitoring:** Live chain validation statistics and transaction details.
*   **Security Watchdog Diagnostics:** Visual tracking of the automated self-destruct mechanisms and manual execution capability.
*   **Node Cluster Status:** Connection details of P2P/mesh routing nodes.
*   **Adaptive Theming:** Zero-latency switching between Light, Dark, and System modes.

---

## 🛠️ The Three Core Pillars

### 1. Decentralized Mesh Network
Nexus operates a P2P-ready mesh system that allows communication and data sync even if centralized servers are offline.
*   **Local Node Clustering:** Each participant acts as a node with a unique `nodeId`.
*   **Chunk-Based File Transfer:** Files are split into small encrypted binary chunks and reassembled dynamically on client nodes, preventing single points of failure.
*   **WebSockets & WebRTC:** Seamless peer-to-peer data syncing hooks.

### 2. Blockchain Ledger
Every message hash, community transaction, and sync operation is logged as a block in a localized, verified blockchain ledger to guarantee integrity.
*   **Proof-of-Work (PoW):** Blocks are minted by solving cryptographic puzzles.
*   **Verification:** Incoming ledger chains are compared against local history to prevent modification or tampering.
*   **API Interactions:**
    *   `GET /api/blockchain/status`: Fetch chain length, nodeId, and pending transaction counts.
    *   `POST /api/blockchain/mine`: Solve and commit pending transactions into a new ledger block.
    *   `GET /api/blockchain/verify/:hash`: Audit a specific message hash against the verified blockchain.

### 3. Security Watchdog
The watchdog secures the workspace by enforcing strict Time-to-Live (TTL) limits on data storage to ensure absolute confidentiality.
*   **Self-Destruct Messages:** Messages automatically expire after a 24-hour window from creation (`expiresAt`).
*   **Midnight Auto-Purge:** A Node-Cron scheduler runs at exactly `00:00:00` daily to hard-delete all expired records.
*   **On-Demand Purging:** Admins can trigger an immediate manual database sweep using the secure `GET /api/internal/purge-expired` endpoint.

---

## 🚀 How to Use the Control Center

### Header Controls
*   **Cron Timer Countdown:** Displays the exact live countdown `[HH:MM:SS]` remaining until the next automatic midnight self-destruct purge. The countdown shifts colors dynamically (Indigo -> Amber -> Rose) as midnight approaches.
*   **Manual Refresh:** Triggers instant re-polling of the blockchain node status, pending transactions queue, and block database.
*   **Theme Switcher:** Seamlessly choose between **Light**, **Dark**, or **System** preferences. The entire UI will instantly adapt its palette, borders, card backgrounds, and charts.

### Operational Actions
1.  **Mining Pending Transactions:**
    *   If the "Pending TXs" stat card indicates queued operations, click **Mine Now** inside the mining panel.
    *   The node API performs Proof-of-Work and outputs a success block hash log.
2.  **Manual Message Purging:**
    *   To clear out-of-date or expired messages immediately instead of waiting for the midnight cron, click **Run Purge** under the watchdog panel.
    *   A live feedback notification displays the exact number of channel messages and direct messages deleted from the OrbitDB store.
3.  **Audit Ledger Blocks:**
    *   Examine the **Blockchain Explorer** paginated table.
    *   Click any individual block (e.g. `#1`, `#2`) to expand it and review the specific type, sender, recipient, and transaction hashes contained within.

---

## 🎨 Theme Support

The Core Control Center is built using modern Next.js CSS variables matching custom OKLCH colors, offering native Light and Dark support.

*   **Dark Mode (Default):** Deep zinc tones with vibrant indigo highlights, reduced glare, and terminal-style typography ideal for system administration.
*   **Light Mode:** High contrast, clean white/gray cards with subtle shadow drops, matching official system guidelines.
*   **System Auto-Detect:** Syncs automatically with the host system preferences (Windows/macOS dark mode).
