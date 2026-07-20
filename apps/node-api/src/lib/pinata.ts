/**
 * Pinata IPFS Storage helper for unpinning files when messages or direct messages
 * are deleted or purged.
 */

/**
 * Extracts IPFS CID / Hash from a file URL or raw hash string.
 * Supports:
 * - https://gateway.pinata.cloud/ipfs/<hash>
 * - https://<any-gateway>/ipfs/<hash>
 * - ipfs://<hash>
 * - Raw CIDv0 (Qm...) or CIDv1 (baf...)
 */
export function extractIpfsHash(fileUrl: string | null | undefined): string | null {
    if (!fileUrl || typeof fileUrl !== "string") return null;
    const trimmed = fileUrl.trim();
    if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
        return null;
    }

    // 1. Try matching /ipfs/<hash> or ipfs://<hash>
    const urlMatch = trimmed.match(/(?:ipfs\/|ipfs:\/\/)([a-zA-Z0-9]+)/i);
    if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
    }

    // 2. Direct CID hash string match (CIDv0 Qm... or CIDv1 baf...)
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{50,70})$/i.test(trimmed)) {
        return trimmed;
    }

    return null;
}

/**
 * Unpins a file from Pinata storage given its URL or IPFS CID/Hash.
 */
export async function unpinFromPinata(fileUrlOrHash: string | null | undefined): Promise<boolean> {
    const hash = extractIpfsHash(fileUrlOrHash);
    if (!hash) {
        return false;
    }

    const apiKey = process.env.PINATA_API_KEY;
    const apiSecret = process.env.PINATA_API_SECRET;
    const jwt = process.env.PINATA_JWT;

    if (!jwt && (!apiKey || !apiSecret)) {
        console.warn(`[Pinata] Cannot unpin hash ${hash}: Missing Pinata credentials in environment variables.`);
        return false;
    }

    const headers: Record<string, string> = {};
    if (jwt) {
        headers["Authorization"] = `Bearer ${jwt}`;
    } else if (apiKey && apiSecret) {
        headers["pinata_api_key"] = apiKey;
        headers["pinata_secret_api_key"] = apiSecret;
    }

    try {
        const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
            method: "DELETE",
            headers,
        });

        if (response.ok) {
            console.log(`[Pinata] Successfully unpinned hash: ${hash}`);
            return true;
        } else {
            const errorText = await response.text().catch(() => "");
            console.warn(`[Pinata] Failed to unpin hash ${hash} (Status ${response.status}): ${errorText}`);
            return false;
        }
    } catch (error: any) {
        console.error(`[Pinata] Error unpinning hash ${hash}:`, error?.message || error);
        return false;
    }
}

/**
 * Unpins multiple files from Pinata storage in parallel.
 * Deduplicates hashes to prevent redundant API calls.
 */
export async function unpinMultipleFromPinata(fileUrlsOrHashes: (string | null | undefined)[]): Promise<number> {
    const hashes = Array.from(
        new Set(
            fileUrlsOrHashes
                .map(extractIpfsHash)
                .filter((h): h is string => Boolean(h))
        )
    );

    if (hashes.length === 0) {
        return 0;
    }

    console.log(`[Pinata] Unpinning ${hashes.length} unique file attachment(s) from Pinata storage...`);
    const results = await Promise.allSettled(hashes.map((hash) => unpinFromPinata(hash)));
    const successCount = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    console.log(`[Pinata] Unpinned ${successCount}/${hashes.length} file attachment(s) successfully.`);
    return successCount;
}
