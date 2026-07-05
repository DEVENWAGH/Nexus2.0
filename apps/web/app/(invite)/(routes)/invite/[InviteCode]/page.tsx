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
        return redirect("/");
    }
    const profile = await CurrentProfile();
    if (!profile) {
        return redirect("/sign-in");
    }

    // Check if user is already a member of this server
    const existingServer = await prisma.server.findFirst({
        where: {
            inviteCode: InviteCode,
            members: {
                some: {
                    profileId: profile.id,
                },
            },
        },
    });
    if (existingServer) {
        return redirect(`/servers/${existingServer.id}`);
    }

    // Verify the invite code exists before trying to join
    const serverToJoin = await prisma.server.findUnique({
        where: {
            inviteCode: InviteCode,
        },
    });

    if (!serverToJoin) {
        // Invalid invite code - redirect to home
        return redirect("/");
    }

    // Join the server by adding the user as a member
    const server = await prisma.server.update({
        where: {
            inviteCode: InviteCode,
        },
        data: {
            members: {
                create: [
                    {
                        profileId: profile.id,
                        role: MemberRole.GUEST,
                    },
                ],
            },
        },
    });

    return redirect(`/servers/${server.id}`);
};

export default InviteCodePage;
