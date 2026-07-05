import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createApp } from "./routes";
import { createSocketServer } from "./socket";
import { prisma } from "@repo/db";
import cron from "node-cron";

const PORT = Number(process.env.NODE_API_PORT || process.env.PORT || 8000);
const SOCKET_IO_PATH = "/api/socket/io";

const httpServer = createServer();
const io = createSocketServer(httpServer);
const app = createApp(io);
const handleHttp = getRequestListener(app.fetch);

// Socket.IO registers first; skip Hono for Engine.IO so responses are not double-written.
httpServer.on("request", (req, res) => {
    const url = req.url ?? "";
    if (url.includes(SOCKET_IO_PATH)) {
        return;
    }
    void handleHttp(req, res);
});

/** Hard-delete all messages whose 24-hour TTL has passed */
async function purgeExpiredMessages(): Promise<void> {
    const now = new Date();
    const [msgs, dms] = await Promise.all([
        prisma.message.deleteMany({ where: { expiresAt: { lte: now } } }),
        prisma.directMessage.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
    if (msgs.count > 0 || dms.count > 0) {
        console.log(
            `[self-destruct] Purged ${msgs.count} messages + ${dms.count} DMs at ${now.toISOString()}`
        );
    } else {
        console.log(`[cron] Midnight purge ran — no expired messages at ${now.toISOString()}`);
    }
}

httpServer.listen(PORT, async () => {
    const bcStatus = await import("./lib/blockchain").then((m) =>
        m.blockchainLogger.getChainStatus(),
    );

    console.log("=".repeat(60));
    console.log("  Nexus Node API");
    console.log(`  REST:      http://localhost:${PORT}`);
    console.log(`  Socket.IO: http://localhost:${PORT}/api/socket/io`);
    console.log("=".repeat(60));
    if (bcStatus.connected) {
        console.log(
            `[Blockchain] OK - Connected (chain length: ${bcStatus.length})`,
        );
    } else {
        console.log(
            "[Blockchain] WARN - Node not reachable (messages still work)",
        );
    }
    console.log("  Features: AES-GCM encryption, blockchain logging, P2P-ready");
    console.log("  Self-destruct: messages auto-expire after 24 hours (purged nightly at midnight)");
    console.log("=".repeat(60));

    // ── Boot purge ─────────────────────────────────────────────────────────
    // Catches any messages that expired while the server was offline
    setTimeout(() => {
        console.log("[boot] Running startup expired-message purge...");
        purgeExpiredMessages().catch(console.error);
    }, 5_000);

    // ── Midnight cron ──────────────────────────────────────────────────────
    // Runs at 00:00:00 every night (server local time).
    // Pattern: second=0, minute=0, hour=0, day=*, month=*, weekday=*
    cron.schedule("0 0 0 * * *", () => {
        console.log("[cron] ⏰ Midnight purge triggered — deleting expired messages...");
        purgeExpiredMessages().catch(console.error);
    });

    console.log("[cron] Midnight purge scheduled at 00:00:00 every night");
});
