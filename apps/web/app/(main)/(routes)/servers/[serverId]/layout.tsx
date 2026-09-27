import ServerSidebar from "@/components/server/server-sidebar";
import { CurrentProfile } from "@/lib/current-profile";
import { prisma } from "@repo/db";
import { redirect } from "next/navigation";
import React from "react";

const ServerIdLayout = async ({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ serverId: string }>;
}) => {
    const profile = await CurrentProfile();

    if (!profile) {
        return redirect("/sign-in");
    }

    const { serverId } = await params;

    const server = await prisma.server.findUnique({
        where: {
            id: serverId,
            members: {
                some: {
                    profileId: profile.id,
                },
            },
        },
    });

    if (!server) {
        return redirect("/setup");
    }

    return (
        <div className="flex h-full">
            <div className="hidden md:flex h-full w-60 z-20 flex-col fixed inset-y-0">
                <ServerSidebar serverId={serverId} />
            </div>
            <main className="md:ml-60 h-full flex-1 min-w-0">{children}</main>
        </div>
    );
};

export default ServerIdLayout;
