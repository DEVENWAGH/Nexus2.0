import { prisma } from "@repo/db";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

/** Hostnames used by UploadThing CDN (utfs.io, *.ufs.sh). */
function isUploadThingHost(hostname: string): boolean {
    return (
        hostname === "utfs.io" ||
        hostname.endsWith(".ufs.sh") ||
        hostname === "uploadthing.com" ||
        hostname.endsWith(".uploadthing.com")
    );
}

/** Extract the UploadThing file key from a public CDN URL, or null if not applicable. */
export function extractUploadThingFileKey(fileUrl: string): string | null {
    if (!fileUrl || fileUrl.startsWith("data:")) {
        return null;
    }

    try {
        const url = new URL(fileUrl);
        if (!isUploadThingHost(url.hostname)) {
            return null;
        }

        const match = url.pathname.match(/^\/f\/(.+)$/);
        if (!match?.[1]) {
            return null;
        }

        return decodeURIComponent(match[1]);
    } catch {
        return null;
    }
}

type ExcludeRef = {
    messageId?: string;
    directMessageId?: string;
};

async function isFileUrlReferencedElsewhere(
    fileUrl: string,
    exclude: ExcludeRef,
): Promise<boolean> {
    const [messageCount, directMessageCount] = await Promise.all([
        prisma.message.count({
            where: {
                fileUrl,
                deleted: false,
                ...(exclude.messageId ? { id: { not: exclude.messageId } } : {}),
            },
        }),
        prisma.directMessage.count({
            where: {
                fileUrl,
                deleted: false,
                ...(exclude.directMessageId
                    ? { id: { not: exclude.directMessageId } }
                    : {}),
            },
        }),
    ]);

    return messageCount + directMessageCount > 0;
}

/**
 * Delete an UploadThing file when a message attachment is removed.
 * Skips data: URIs, non-UploadThing URLs, and files still referenced by other messages.
 */
export async function deleteUploadThingFileForMessage(
    fileUrl: string | null | undefined,
    exclude: ExcludeRef,
): Promise<void> {
    if (!fileUrl) {
        return;
    }

    const fileKey = extractUploadThingFileKey(fileUrl);
    if (!fileKey) {
        return;
    }

    if (await isFileUrlReferencedElsewhere(fileUrl, exclude)) {
        return;
    }

    try {
        await utapi.deleteFiles(fileKey);
    } catch (error) {
        console.error("[uploadthing] Failed to delete file:", fileKey, error);
    }
}
