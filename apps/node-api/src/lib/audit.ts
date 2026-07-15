import { prisma } from "@repo/db";
import { decryptMessage } from "@repo/p2p";
import { hashMessageAsync } from "./blockchain-hash";
import { localBlockchain } from "./local-blockchain";
import { sendMail, getTamperAlertEmailTemplate } from "./mail";

export interface TamperedDetail {
    id: string;
    content: string;
    member: string;
    timestamp: string;
}

export interface AuditResult {
    verified: boolean;
    totalChecked: number;
    tamperedCount: number;
    tamperedDetails: TamperedDetail[];
}

export async function performIntegrityAudit(): Promise<AuditResult> {
    const [messages, directMessages] = await Promise.all([
        prisma.message.findMany({
            where: { deleted: false },
            include: { member: { include: { profile: true } } },
        }),
        prisma.directMessage.findMany({
            where: { deleted: false },
            include: { member: { include: { profile: true } } },
        })
    ]);

    const tamperedDetails: TamperedDetail[] = [];

    // Verify channel messages
    for (const msg of messages) {
        if (!msg.content) continue;
        try {
            const decrypted = await decryptMessage(msg.content, msg.channelId);
            const hash = await hashMessageAsync(decrypted);
            const ledgerMatch = await localBlockchain.verifyMessage(hash);
            if (!ledgerMatch) {
                tamperedDetails.push({
                    id: msg.id,
                    content: decrypted,
                    member: msg.member.profile.name,
                    timestamp: msg.createdAt.toISOString(),
                });
            }
        } catch (err) {
            tamperedDetails.push({
                id: msg.id,
                content: "[Decryption/Verification Failed - Content Tampered]",
                member: msg.member.profile.name,
                timestamp: msg.createdAt.toISOString(),
            });
        }
    }

    // Verify direct messages
    for (const dm of directMessages) {
        if (!dm.content) continue;
        try {
            const decrypted = await decryptMessage(dm.content, dm.conversationId);
            const hash = await hashMessageAsync(decrypted);
            const ledgerMatch = await localBlockchain.verifyMessage(hash);
            if (!ledgerMatch) {
                tamperedDetails.push({
                    id: dm.id,
                    content: decrypted,
                    member: dm.member.profile.name,
                    timestamp: dm.createdAt.toISOString(),
                });
            }
        } catch (err) {
            tamperedDetails.push({
                id: dm.id,
                content: "[Decryption/Verification Failed - Content Tampered]",
                member: dm.member.profile.name,
                timestamp: dm.createdAt.toISOString(),
            });
        }
    }

    const tamperedCount = tamperedDetails.length;
    const verified = tamperedCount === 0;

    return {
        verified,
        totalChecked: messages.length + directMessages.length,
        tamperedCount,
        tamperedDetails,
    };
}

export async function runAndEmailAudit(): Promise<AuditResult> {
    const result = await performIntegrityAudit();
    if (!result.verified && process.env.email) {
        const html = getTamperAlertEmailTemplate(result.tamperedDetails);
        await sendMail({
            to: process.env.email,
            subject: "🚨 SECURITY ALERT: Database Tampering Detected in Nexus!",
            html,
        });
    }
    return result;
}
