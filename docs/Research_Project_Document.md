# Research Project Proposal & Technical Documentation
## Platform Name: Nexus Community
**Academic and Architectural Specifications for Blockchain-Based Lightweight Decentralized Secure Communication**

---

### 1. Introduction

#### 1.1 Introduction
**Nexus Community** is a secure, state-of-the-art hybrid communication platform that bridges centralized collaboration utility with decentralized cryptographic privacy. In today's digital era, collaborative systems require real-time text, voice, and video interfaces similar to Discord or Slack. However, standard solutions store user records, message logs, and shared files in plaintext on cloud servers, making them vulnerable to data breaches, corporate surveillance, and database tampering. 

Nexus addresses this problem through a **hybrid architecture** that splits roles: a centralized backend handles data routing, video streaming coordination, and user registration, while the client maintains cryptographic ownership. The system features:
* An embedded local Proof-of-Work (PoW) blockchain ledger.
* Cryptographic identities generated locally via W3C-compatible Decentralized Identifiers (DIDs).
* A multi-format steganography suite (Images, Audio, Video, PDF) for obfuscated data transfer.
* End-to-End Encryption (E2EE) at rest and in transit using AES-256-GCM.
* 24-hour self-destructing data lifecycles monitored by active watchdog systems.

#### 1.2 Background
Traditional enterprise messaging is built on centralized architectures. Client nodes connect to monolithic backend systems that store chats in relational databases (e.g., PostgreSQL, MySQL). While secure transport protocols (HTTPS/WSS) protect data in transit, the host database remains a single point of failure (SPOF). System administrators, database operators, or malicious actors with access to the cloud environment can inspect, edit, or delete messages without detection. 

Conversely, fully decentralized networks (Web3, pure Peer-to-Peer meshes) generate identity using public key pairs and sync messages using distributed ledgers or Conflict-Free Replicated Data Types (CRDTs). While these systems remove the central point of failure, they suffer from high latency, eventual consistency issues, NAT traversal failures, and browser memory overload. Nexus is designed to combine the strengths of both models: using centralized nodes for routing efficiency and client-side cryptography to secure the data.

#### 1.3 Motivation
The primary motivation behind Nexus is to build a collaborative tool that gives users **data sovereignty** without sacrificing performance. The system uses three core design concepts to protect privacy:
1. **Cryptographic Blinding:** Central servers and databases handle data indexing but are blinded to the actual message contents via client-side or application-level AES-256-GCM encryption.
2. **Immutable Auditing:** The database is paired with an independent hash chain ledger. If an administrator alters messages directly in the SQL database, the hash verification check fails, alerting the user to the tampering.
3. **Covert Communication:** In environments with strict traffic monitoring, standard encryption headers can flag users for surveillance. Steganography allows users to conceal encrypted payloads within standard media attachments.

#### 1.4 Importance of the Research
This research addresses critical vulnerabilities in modern remote collaboration tools:
* **Prevention of Insider Threats:** Protects against unauthorized database modifications by database administrators (DBAs).
* **Metadata Obfuscation & Evasion:** Hides communication payloads inside media envelopes, ensuring that eavesdroppers see only standard images, audio, or PDF traffic.
* **Ephemeral Data Management:** Guarantees that deleted records are permanently cleared from all systems via a strict 24-hour Time-To-Live (TTL) expiration cycle.
* **Serverless P2P Fallback:** Enables direct browser-to-browser communications that bypass the central server database entirely.

---

### 2. Literature Review

#### 2.1 Existing Work
Modern secure communication systems generally fall into two categories:

1. **Centralized Encrypted Messengers (e.g., Signal, WhatsApp):**
   * These systems use the Signal Protocol (Double Ratchet Algorithm) to provide End-to-End Encryption (E2EE) for chats.
   * **Limitation:** They rely on centralized servers to store message queues and metadata. While the message contents are secure, the central server knows who is communicating, when, and how often. Furthermore, they do not provide a built-in mechanism to verify database integrity or hide payloads via steganography.
2. **Fully Decentralized Networks (e.g., Matrix, GunDB, IPFS-based systems):**
   * These networks use peer-to-peer routing and distributed consensus to eliminate central servers.
   * **Limitation:** They suffer from high connection failure rates due to NAT firewalls, cannot deliver messages when the recipient is offline, and require substantial device resources. For example, storing media files on IPFS makes permanent deletion difficult, which violates self-destructing data requirements.

#### 2.2 Comparison of Previous Methods

| System Component | Centralized Messengers (Signal/Slack) | Fully Decentralized (Matrix/OrbitDB/IPFS) | Nexus Hybrid Architecture |
|---|---|---|---|
| **Identity Management** | Phone number / Central Email Auth | Public/Private Key pair (User-managed) | Native JWT Auth + Sandboxed Local Web Crypto DID (`did:key`) |
| **Data Consistency** | Strong ACID, sub-millisecond | Eventual consistency, high conflict rates | Strong ACID routing + Client-side decrypted caches |
| **Voice & Video Scaling** | $O(N)$ via central SFU relays | $O(N^2)$ via WebRTC mesh (scales poorly) | Native WebRTC P2P Mesh via signaling server |
| **Audit Mechanism** | None (trust is placed in the host) | Public blockchain (high gas, slow) | Local Proof-of-Work Hash Ledger (zero-gas, instant) |
| **Media Deletion** | Logical delete, server stays dirty | Impossible once pinned/cached on peers | 24h expiration cron sweep + Pinata IPFS unpinning |
| **Censorship Evasion** | Domain fronting (expensive) | Tor/I2P routing (slow) | LSB & Post-EOF Multi-media Steganography |

#### 2.3 Summary of Findings
The literature reveals that a **hybrid architecture** is the most practical choice for secure, high-performance communication. A centralized server is used to route metadata, maintain real-time socket connections, and run video unit relays. Meanwhile, client-side encryption, decentralized identity, and a local blockchain ledger ensure that the server cannot read or alter the communication history.

---

### 3. Limitations of Existing Work

#### 3.1 Drawbacks of Current Approaches
* **Lack of Historical Integrity Verification:** In systems like Slack or standard database applications, administrators can change past message entries directly in SQL tables. Users have no way to verify if their chat history has been altered.
* **Susceptibility to Traffic Analysis:** Security firewalls can monitor network traffic for encrypted communication protocols. High volumes of encrypted packets can draw attention to users.
* **Persistent Digital Footprint:** Deleted files often remain cached in cloud storage buckets or peer nodes indefinitely, exposing users to forensic data recovery.
* **High Barrier to Entry in P2P Systems:** Decentralized Web3 networks require users to set up crypto wallets, manage private keys, and pay gas fees, which limits broad adoption.

#### 3.2 Unsolved Challenges
1. **The CAP Theorem Dilemma:** Decentralized systems struggle to maintain data consistency (C) and partition tolerance (P) while providing the high availability (A) and speed expected from real-time chat.
2. **Concealing Ephemeral Metadata:** Coordinating peer connections requires signaling servers, which can expose metadata regarding user interactions.
3. **Browser Memory Management:** Web browsers have strict limits on JavaScript heap size, which can cause tabs to crash when receiving large files over peer-to-peer networks.

---

### 4. Research Gap

#### 4.1 What is Missing in the Existing Research?
There is currently no unified framework that combines:
* Relational database efficiency.
* Local, zero-gas Proof-of-Work blockchain validation.
* Web-native WebRTC peer connections.
* Automated steganographic payload obfuscation.

Most security research focuses on specific components (such as improving encryption algorithms or optimizing steganography pixel layouts) rather than building an integrated, usable platform.

#### 4.2 Why is Further Research Needed?
Further research is needed to develop systems that are secure against database-level tampering and metadata tracking while remaining user-friendly. By combining centralized routing with client-side cryptographic checks, developers can create tools that protect user privacy without the performance and financial costs of public blockchains.

---

### 5. Problem Statement

#### 5.1 Problem Definition
"Centralized team collaboration software exposes private text, user identities, and shared files to service operators, making them vulnerable to unauthorized database modifications and forensic traffic analysis. Conversely, fully decentralized peer-to-peer networks suffer from connection failures, high video call latency, and permanent media caching."

#### 5.2 Research Objectives
The goal of this project is to develop and evaluate **Nexus**, a lightweight hybrid secure communication platform. The objectives include:
1. **Data Security:** Encrypt all database-stored messages and live peer-to-peer payloads using AES-256-GCM.
2. **History Integrity:** Maintain a local Proof-of-Work hash ledger to detect database tampering.
3. **Peer Authenticity:** Generate ECDSA public/private key pairs locally to sign and verify peer-to-peer message packets.
4. **Covert Communication:** Hide sensitive data inside standard image, audio, video, and PDF attachments.
5. **Data Minimization:** Enforce a strict 24-hour self-destruct cycle that sweeps expired messages and deletes files from host servers.
6. **Direct Peer Sharing:** Build a chunk-based WebRTC data channel system to share files directly between browsers.

---

### 6. Research Objectives

```
                       ┌───────────────────────────────┐
                       │   PRIMARY RESEARCH OBJECTIVE  │
                       └───────────────┬───────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│  Secure Hybrid Data  │   │ Covert Steganography │   │ Immutable Integrity  │
│  Flow & WebRTC Mesh  │   │   Payload Obfuscation│   │   Ledger Validation  │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

#### 6.1 Primary Objective
To design and implement a secure hybrid communication platform that uses client-side Web Crypto identities and local Proof-of-Work mining to audit database integrity.

#### 6.2 Secondary Objectives
* **Steganographic Processing:** Build encoders and decoders that embed text inside media files (using red-channel LSB and binary-append techniques) with optional password protection.
* **Peer-to-Peer Mesh Routing:** Implement a WebRTC signaling client and mesh manager that automatically establishes direct, encrypted data channels between users.
* **Chunk-Based File Transfer:** Slice files into 32KB chunks, compute SHA-256 integrity hashes, and use ACK-based flow control to transmit files directly between browser heaps.
* **Automated Expiration Cleanup:** Run server-side cron jobs to delete expired messages and remove attachments from cloud servers.
* **Core Control Center Dashboard:** Build a glassmorphic dashboard to monitor system diagnostics, mine pending transactions, and check blockchain integrity.

---

### 7. Novelty / Proposed Contribution

#### 7.1 What is New in Your Work?
1. **Local Proof-of-Work Blockchain Ledger:** Nexus runs a local hash chain ledger on the backend. When a message is sent, its SHA-256 hash is logged to the mempool. Admins can run Proof-of-Work mining (4 leading zeros difficulty) to lock these hashes into blocks. This guarantees message history integrity at zero financial cost.
2. **W3C did:key Web Crypto Identities:** Nexus generates ECDSA key pairs locally using the browser's Web Crypto API. The private keys are stored in a sandboxed IndexedDB, while the public keys are exported as `did:key:z<spki-hex>` strings to sign and verify WebRTC packets.
3. **Multi-Format Steganography Suite:** Steganography tools are built directly into the messaging interface, allowing users to encode and decode payloads in standard formats (Image, Audio, Video, PDF) with a single click.

#### 7.2 How it Differs from Previous Research
Nexus avoids the performance and cost issues of public blockchains and the reliability issues of pure P2P networks. By utilizing centralized servers only for routing and metadata indexation (with all data encrypted at rest), Nexus provides the speed of Slack or Discord while giving users cryptographic ownership of their data.

---

### 8. Proposed Methodology / Proposed Architecture

```
  Next.js 16 Web Client                                Node API Hono Server
  ┌───────────────────────┐                            ┌───────────────────────┐
  │   W3C did:key Gen     │                            │  AES-256-GCM Encrypt  │
  │   IndexedDB Sandbox   │                            │  PoW Blockchain       │
  └──────────┬────────────┘                            └──────────┬────────────┘
             │                                                    │
             │ (WebRTC SDP Signaling)                             │ (HTTP / Socket.IO)
             ▼                                                    ▼
  ┌───────────────────────┐                            ┌───────────────────────┐
  │   Signaling Server    │                            │     OrbitDB Database  │
  └───────────────────────┘                            └───────────────────────┘
```

#### 8.1 System Architecture
Nexus is structured as a Turborepo monorepo:
* **`apps/web`:** Next.js 16 frontend styled with Tailwind CSS v4 and Shadcn/UI, using Zustand for state management and React Query for caching.
* **`apps/node-api`:** Node.js backend using the Hono framework. It manages real-time messaging, steganographic conversions, and blockchain logging.
* **`apps/signaling-server`:** WebSocket server that coordinates WebRTC SDP/ICE handshakes.
* **`packages/db`:** Prisma schema definitions and OrbitDB HTTP proxy client.
* **`packages/p2p`:** Shared library managing peer-to-peer connections, Web Crypto DIDs, and file transfer slicing.

#### 8.2 Workflow

##### 8.2.1 Text Messaging Workflow
1. **Send:** The user enters a message in the Next.js client.
2. **Encrypt-at-Rest:** The Node API encrypts the message with AES-256-GCM using the channel's key.
3. **Blockchain Log:** The server logs the message hash to the Proof-of-Work mempool.
4. **Store:** The encrypted message is saved in OrbitDB.
5. **Real-time Broadcast:** The decrypted message is broadcasted to active room members via Socket.IO.

##### 8.2.2 P2P Chunk-Based File Transfer Workflow
1. **Slice:** The sending client slices the file into 32KB chunks.
2. **Hash & Encrypt:** Each chunk is hashed (SHA-256) and encrypted with AES-256-GCM.
3. **Transmit:** Chunks are sent via RTCDataChannel.
4. **Verify & Ack:** The receiver verifies each chunk's hash and sends an ACK.
5. **Reconstruct:** Chunks are reassembled into a Blob, and the browser triggers a local file download.

```
+─────────────────────────────────────────────────────────────────────────────+
|                          STEP-BY-STEP MESSAGING FLOW                        |
|                                                                             |
|  [Sender Client] ───(Plaintext Message)───> [Node API Hono Server]          |
|                                                     │                       |
|                                            (AES-256-GCM Encrypt)            |
|                                            (Log Hash to Ledger)             |
|                                                     ▼                       |
|  [Receiver Client] <───(Socket.IO/P2P)─── [OrbitDB Storage]                 |
+─────────────────────────────────────────────────────────────────────────────+
```

#### 8.3 Algorithms and Models Used

##### 8.3.1 Cryptographic Identity (DID Generation)
```typescript
// Identity Curve: ECDSA P-256
const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
);
const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
const didKey = `did:key:z${toHex(spki)}`;
```

##### 8.3.2 Proof-of-Work Consensus Model
The backend implements a Proof-of-Work algorithm to seal blocks.
$$\text{guessHash} = \text{SHA256}(\text{lastProof} \parallel \text{proof})$$
The block is valid when the hash contains 4 leading zeros:
$$\text{guessHash}.substring(0, 4) === \text{"0000"}$$

##### 8.3.3 Image Steganography (LSB Red-Channel)
Hides text bits in the Least Significant Bit (LSB) of each pixel's red channel.
$$\text{pixel.R} = (\text{pixel.R} \ \& \ \text{0xFE}) \ | \ \text{bit}$$
During decoding, the bit is retrieved using:
$$\text{bit} = \text{pixel.R} \ \& \ \text{1}$$

##### 8.3.4 Binary-Append Steganography (Audio, Video, PDF)
Appends the payload after a unique magic marker at the end of the file.
$$\text{Payload} = \text{[Original Audio/Video/PDF Bytes]} \parallel \text{[MAGIC\_MARKER]} \parallel \text{[Payload Length]} \parallel \text{[Encrypted Text]}$$

---

### 9. Implementation Plan

#### 9.1 Dataset & Media Test Suite
* **Media Formats:** PNG/JPEG for images, MP3/WAV for audio, MP4/WebM for video, and PDF for document tests.
* **Simulated Messages:** Plaintext strings, binary injections, and oversized messages (>64KB) to test the security watchdog.

#### 9.2 Tools and Technologies
* **Language:** TypeScript (Next.js 16, Hono, Node.js).
* **Styling:** Tailwind CSS v4, Shadcn/UI.
* **Database:** OrbitDB (via Prisma HTTP Proxy).
* **Auth:** Native Session Cookie (`__session`) & Hono JWT Auth.
* **Storage:** Pinata IPFS & WebRTC P2P DataChannels.
* **Relays:** WebRTC P2P Mesh & WebSocket Signaling Server.
* **Package Manager:** Yarn Berry (v4) in a Turborepo monorepo.

#### 9.3 Experimental Setup
The test environment consists of:
* A local Docker container running PostgreSQL.
* Two independent browser client sessions simulating remote peers.
* Host servers running the Hono API and Signaling Relay.
* A WebRTC P2P mesh setup to test multi-party audio/video channels.

---

### 10. Expected Outcomes

```
┌─────────────────────────────────────────────────────────────────────────────┐
|                              EXPECTED METRICS                               |
|                                                                             |
|   - DB Query Time (Relational): < 50ms                                      |
|   - Real-time Message Sync: < 10ms                                          |
|   - P2P Audio/Video Latency: < 200ms                                        |
|   - Steganography Recovery Rate: 100% (Bit-perfect decoding)                |
|   - Database Integrity Verifications: Automated midnight audit runs         |
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 10.1 Expected Results
* **Security-at-Rest:** All database messages are encrypted, preventing exposure during database leaks.
* **Real-time Performance:** Relational queries execute in under 50ms, and messages sync via Socket.IO in under 10ms.
* **P2P Audio/Video Latency:** Direct peer channels maintain sub-200ms latency for voice and video streams.
* **Steganographic Integrity:** Embedded text payloads are recovered with a 100% success rate without degrading the host media quality.
* **Tamper Detection:** The local blockchain flags unauthorized database changes, showing a warning badge in the UI.

#### 10.2 Benefits
* **Cost Efficiency:** Using a local Proof-of-Work blockchain logs integrity audits without gas fees.
* **Data Sovereignty:** Users maintain control of their keys and data lifecycles.
* **Forensic Resistance:** The 24-hour self-destruct cycle and steganographic features help protect sensitive communication.

#### 10.3 Applications
* **Secure Enterprise Collaboration:** Privacy-first communications for sensitive business operations.
* **Secure Whistleblowing Platforms:** Obfuscated channels that protect source identities.
* **Defense & Public Safety Networks:** Decentralized messaging channels that can operate over local networks during outages.

---

### 11. Conclusion and Future Scope

#### 11.1 Conclusion
The Nexus platform demonstrates that a **hybrid architecture** can provide high-performance team collaboration features while maintaining strict cryptographic privacy. Client-side identity generation, database encryption, local blockchain verification, and steganography combine to build a secure communication platform that protects user data without the latency and cost issues of fully decentralized networks.

#### 11.2 Future Scope
* **Alternate Routing (Multi-hop Mesh):** Implement message routing through intermediate peers to bypass connection blockers.
* **True Zero-Knowledge E2EE Database Storage:** Move the encryption and decryption pipeline entirely to the client so the backend never sees plaintext.
* **Persistent Blockchain Database:** Move block storage from in-memory RAM to OrbitDB models so ledger history survives server restarts.
* **File System Access API Integration:** Stream files directly to local disks during WebRTC transfers to support large file transfers without browser tab crashes.
* **Spread-Spectrum Steganography:** Implement pseudo-random pixel distribution algorithms to make steganographic payloads more resilient against statistical analysis.

---

**Research Project Presentation Ready**  
*Department of Computer Science & Engineering*

**Thanks & Regards,**  

**Prof. Abhijeet More**  
*HoD (Department of Computer Application),*  
*Assistant Professor (Department of Computer Engineering),*  
*National Level Hackathon Coordinator*  
*Nexus Community Project Advisor*  
