import { CurrentProfile } from "@/lib/current-profile";
import { prisma, MemberRole } from "@repo/db";
import { redirect } from "next/navigation";

const InviteCodePage = async ({
    params,
}: {
    params: Promise<{ InviteCode: string }>;
}) => {
    const { InviteCode } = await params;

    if (!InviteCode) {
        return redirect("/setup");
    }
    const profile = await CurrentProfile();
    if (!profile) {
        return redirect("/sign-in");
    }

    const serverToJoin = await prisma.server.findUnique({
        where: {
            inviteCode: InviteCode,
        },
    });

    if (!serverToJoin) {
        return redirect("/setup");
    }

    // Use a direct member lookup (scalar fields) so OrbitDB can match reliably
    const existingMember = await prisma.member.findFirst({
        where: {
            serverId: serverToJoin.id,
            profileId: profile.id,
        },
    });

    if (!existingMember) {
        await prisma.member.create({
            data: {
                profileId: profile.id,
                serverId: serverToJoin.id,
                role: MemberRole.GUEST,
            },
        });

        // Trigger real-time join notification to server room
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        try {
            await fetch(`${backendUrl}/api/servers/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-User-Id": profile.userId,
                },
                body: JSON.stringify({ inviteCode: InviteCode }),
            });
        } catch {
            // Non-fatal
        }
    }

    return redirect(`/servers/${serverToJoin.id}`);
};

export default InviteCodePage;
