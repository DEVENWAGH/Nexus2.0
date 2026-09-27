import { CurrentProfile } from "@/lib/current-profile";
import { prisma } from "@repo/db";
import { redirect } from "next/navigation";

const ServerPage = async ({
    params,
}: {
    params: Promise<{ serverId: string }>;
}) => {
    const { serverId } = await params;

    const profile = await CurrentProfile();
    if (!profile) {
        return redirect("/sign-in");
    }

    const server = await prisma.server.findUnique({
        where: {
            id: serverId,
            members: {
                some: {
                    profileId: profile.id,
                },
            },
        },
        include: {
            channels: {
                where: {
                    name: "general",
                },
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });
    if (!server) {
        return redirect("/setup");
    }

    const initialChannel = server?.channels?.[0];
    if (!initialChannel || initialChannel.name !== "general") {
        return redirect("/setup");
    }
    return redirect(`/servers/${serverId}/channels/${initialChannel.id}`);
};

export default ServerPage;
