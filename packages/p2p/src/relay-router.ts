/**
 * Multi-Hop Relay Router for P2P Mesh Command Propagation.
 *
 * Provides signed relay envelopes, LRU dedup cache, passive route-table
 * construction, TTL-based flood control, and loop detection.  Every relay
 * envelope is cryptographically signed by the originating node's ECDSA
 * DID private key so intermediate relay nodes cannot forge or tamper with
 * the inner payload.
 */

import { signPayload, verifyPayload } from "./identity";

// ── Relay Envelope ────────────────────────────────────────────────────────────

export type RelayEnvelope = {
    /** Unique id for dedup (UUID v4) */
    relayId: string;
    /** DID peerId of the original sender */
    originPeerId: string;
    /** Target peer or "*" for broadcast */
    destinationPeerId: string;
    /** Remaining hops (decremented at each relay) */
    ttl: number;
    /** Ordered list of peerIds this envelope has traversed */
    path: string[];
    /** Unix-ms timestamp at creation — reject if stale */
    timestamp: number;
    /** ECDSA hex signature over `relayId|originPeerId|innerPayload|timestamp` */
    signature: string;
    /** The original serialised data-channel envelope (JSON string) */
    innerPayload: string;
};

// ── Route Table Entry ─────────────────────────────────────────────────────────

export type RouteEntry = {
    /** The next-hop peer we should send to in order to reach `peerId` */
    via: string;
    /** Number of hops to reach destination */
    hops: number;
    /** Last time this route was refreshed (unix-ms) */
    lastSeen: number;
};

// ── Relay Statistics ──────────────────────────────────────────────────────────

export type RelayStats = {
    forwarded: number;
    dropped: number;
    cacheSize: number;
    routeTableSize: number;
};

// ── LRU Seen-Message Cache ────────────────────────────────────────────────────

const DEFAULT_CACHE_CAPACITY = 2000;
const DEFAULT_CACHE_TTL_MS = 60_000; // 60 seconds

class SeenCache {
    private cache = new Map<string, number>(); // relayId → timestamp
    private readonly capacity: number;
    private readonly ttlMs: number;

    constructor(capacity = DEFAULT_CACHE_CAPACITY, ttlMs = DEFAULT_CACHE_TTL_MS) {
        this.capacity = capacity;
        this.ttlMs = ttlMs;
    }

    /** Returns true if the relayId was already seen (or is stale). */
    has(relayId: string): boolean {
        const ts = this.cache.get(relayId);
        if (ts === undefined) return false;
        // Evict if expired
        if (Date.now() - ts > this.ttlMs) {
            this.cache.delete(relayId);
            return false;
        }
        return true;
    }

    /** Marks a relayId as seen. Evicts oldest entries when at capacity. */
    add(relayId: string): void {
        // Evict oldest if at capacity
        if (this.cache.size >= this.capacity) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(relayId, Date.now());
    }

    /** Purge expired entries (call periodically). */
    prune(): void {
        const now = Date.now();
        for (const [id, ts] of this.cache) {
            if (now - ts > this.ttlMs) this.cache.delete(id);
        }
    }

    get size(): number {
        return this.cache.size;
    }
}

// ── Relay Router ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_TTL = 3;
const MAX_ALLOWED_TTL = 5;
const ENVELOPE_MAX_AGE_MS = 30_000; // reject envelopes older than 30s
const ROUTE_STALE_MS = 60_000; // route entries older than 60s are considered stale

export type RelayRouterOptions = {
    /** This node's peerId */
    localPeerId: string;
    /** Maximum TTL for outgoing relay envelopes */
    maxTTL?: number;
};

export class RelayRouter {
    private readonly localPeerId: string;
    private readonly maxTTL: number;
    private readonly seen = new SeenCache();
    private readonly routes = new Map<string, RouteEntry>();
    private pruneTimer: ReturnType<typeof setInterval> | null = null;

    // ── Stats ──
    private _forwarded = 0;
    private _dropped = 0;

    constructor(options: RelayRouterOptions) {
        this.localPeerId = options.localPeerId;
        this.maxTTL = Math.min(options.maxTTL ?? DEFAULT_MAX_TTL, MAX_ALLOWED_TTL);

        // Periodic cache & route table cleanup every 15s
        this.pruneTimer = setInterval(() => {
            this.seen.prune();
            this.pruneRoutes();
        }, 15_000);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Wrap an outgoing payload in a signed relay envelope.
     */
    async wrapForRelay(
        innerPayload: string,
        destinationPeerId: string,
        privateKey: CryptoKey,
    ): Promise<RelayEnvelope> {
        const relayId = crypto.randomUUID();
        const timestamp = Date.now();
        const sigContent = this.getSignatureContent(relayId, this.localPeerId, innerPayload, timestamp);
        const signature = await signPayload(privateKey, sigContent);

        const envelope: RelayEnvelope = {
            relayId,
            originPeerId: this.localPeerId,
            destinationPeerId,
            ttl: this.maxTTL,
            path: [this.localPeerId],
            timestamp,
            signature,
            innerPayload,
        };

        // Mark own messages as seen so we don't process them again
        this.seen.add(relayId);
        return envelope;
    }

    /**
     * Determine if an incoming relay envelope should be relayed forward.
     * Does NOT modify the envelope — use processIncoming() for that.
     */
    shouldRelay(envelope: RelayEnvelope): boolean {
        // Already seen
        if (this.seen.has(envelope.relayId)) return false;

        // Expired envelope (replay guard)
        if (Date.now() - envelope.timestamp > ENVELOPE_MAX_AGE_MS) return false;

        // TTL exhausted
        if (envelope.ttl <= 0) return false;

        // Loop detection: we are already in the path
        if (envelope.path.includes(this.localPeerId)) return false;

        return true;
    }

    /**
     * Process an incoming relay envelope:
     * 1. Validate freshness, dedup, loop
     * 2. Verify origin signature
     * 3. Update route table from path
     * 4. Return whether this node is the destination + a forwarding-ready envelope
     */
    async processIncoming(
        envelope: RelayEnvelope,
        fromPeerId: string,
        originDid?: string,
    ): Promise<{
        forMe: boolean;
        shouldForward: boolean;
        forwarded: RelayEnvelope | null;
        dropReason?: string;
    }> {
        // ── Dedup ──
        if (this.seen.has(envelope.relayId)) {
            this._dropped++;
            return { forMe: false, shouldForward: false, forwarded: null, dropReason: "duplicate" };
        }

        // ── Freshness ──
        if (Date.now() - envelope.timestamp > ENVELOPE_MAX_AGE_MS) {
            this._dropped++;
            return { forMe: false, shouldForward: false, forwarded: null, dropReason: "expired" };
        }

        // ── Loop ──
        if (envelope.path.includes(this.localPeerId)) {
            this._dropped++;
            return { forMe: false, shouldForward: false, forwarded: null, dropReason: "loop" };
        }

        // ── TTL ──
        if (envelope.ttl <= 0) {
            this._dropped++;
            return { forMe: false, shouldForward: false, forwarded: null, dropReason: "ttl-exhausted" };
        }

        // ── Signature verification (if DID available) ──
        if (originDid) {
            const sigContent = this.getSignatureContent(
                envelope.relayId,
                envelope.originPeerId,
                envelope.innerPayload,
                envelope.timestamp,
            );
            const valid = await verifyPayload(originDid, envelope.signature, sigContent);
            if (!valid) {
                this._dropped++;
                return { forMe: false, shouldForward: false, forwarded: null, dropReason: "invalid-signature" };
            }
        }

        // ── Mark seen ──
        this.seen.add(envelope.relayId);

        // ── Update route table from path ──
        this.updateRoutesFromPath(envelope.path, fromPeerId);

        // ── Determine if for us ──
        const forMe =
            envelope.destinationPeerId === this.localPeerId ||
            envelope.destinationPeerId === "*";

        // ── Build forwarding envelope ──
        const shouldForward =
            envelope.destinationPeerId === "*" || // broadcast always forwards
            (!forMe && envelope.ttl > 1); // unicast forwards if not for us and TTL allows

        let forwarded: RelayEnvelope | null = null;
        if (shouldForward) {
            forwarded = {
                ...envelope,
                ttl: envelope.ttl - 1,
                path: [...envelope.path, this.localPeerId],
            };
            this._forwarded++;
        }

        return { forMe, shouldForward, forwarded };
    }

    /**
     * Get the best next-hop peer(s) to forward a relay envelope to.
     * Priority: 1) direct peer  2) route-table via  3) flood all connected
     */
    getNextHops(destinationPeerId: string, connectedPeerIds: string[], excludePeerIds: string[]): string[] {
        const exclude = new Set(excludePeerIds);
        const candidates = connectedPeerIds.filter((id) => !exclude.has(id));

        if (destinationPeerId === "*") {
            // Broadcast: send to all connected peers not in exclude
            return candidates;
        }

        // 1. Direct connection available
        if (candidates.includes(destinationPeerId)) {
            return [destinationPeerId];
        }

        // 2. Route table lookup
        const route = this.routes.get(destinationPeerId);
        if (route && candidates.includes(route.via)) {
            return [route.via];
        }

        // 3. Flood to all connected peers (controlled by TTL)
        return candidates;
    }

    /** Get the current route table (for analytics display). */
    getRouteTable(): Map<string, RouteEntry> {
        return new Map(this.routes);
    }

    /** Get relay statistics. */
    getStats(): RelayStats {
        return {
            forwarded: this._forwarded,
            dropped: this._dropped,
            cacheSize: this.seen.size,
            routeTableSize: this.routes.size,
        };
    }

    /** Clean up timers. */
    destroy(): void {
        if (this.pruneTimer) {
            clearInterval(this.pruneTimer);
            this.pruneTimer = null;
        }
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    /** Build deterministic content string for signing/verifying. */
    private getSignatureContent(
        relayId: string,
        originPeerId: string,
        innerPayload: string,
        timestamp: number,
    ): string {
        return `${relayId}|${originPeerId}|${innerPayload}|${timestamp}`;
    }

    /**
     * Passively learn routes from the path array in relay envelopes.
     * Each peer in the path is reachable via `fromPeerId` in (pathIndex+1) hops.
     */
    private updateRoutesFromPath(path: string[], fromPeerId: string): void {
        const now = Date.now();
        for (let i = 0; i < path.length; i++) {
            const peerId = path[i];
            if (peerId === this.localPeerId) continue;

            const hops = path.length - i; // hops from us (through fromPeerId)
            const existing = this.routes.get(peerId);

            // Update if new, shorter, or refreshing existing route
            if (!existing || hops < existing.hops || now - existing.lastSeen > ROUTE_STALE_MS) {
                this.routes.set(peerId, { via: fromPeerId, hops, lastSeen: now });
            }
        }
    }

    /** Remove stale route entries. */
    private pruneRoutes(): void {
        const now = Date.now();
        for (const [peerId, entry] of this.routes) {
            if (now - entry.lastSeen > ROUTE_STALE_MS * 2) {
                this.routes.delete(peerId);
            }
        }
    }
}
