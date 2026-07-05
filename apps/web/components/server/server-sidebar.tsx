import { CurrentProfile } from "@/lib/current-profile";
import { redirect } from "next/navigation";
import { prisma } from "@repo/db";
import { ChannelType, MemberRole } from "@repo/db";
import ServerHeader from "./server-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { HashIcon, Video, Volume2, Network } from "lucide-react";
import Link from "next/link";
import ServerSearch from "./server-search";
import ServerSection from "./server-section";
import ServerChannel from "./server-channel";
import ServerMember from "./server-member";
import { roleIconMap } from "@/constants/roleIconMap";

const iconMap = {
    [ChannelType.AUDIO]: <Volume2 className="mr-2 h-4 w-4" />,
    [ChannelType.TEXT]: <HashIcon className="mr-2 h-4 w-4" />,
    [ChannelType.VIDEO]: <Video className="mr-2 h-4 w-4" />,
};

const ServerSidebar = async ({ serverId }: { serverId: string }) => {
    const profile = await CurrentProfile();
    if (!profile) {
        return redirect("/sign-in");
    }

    const server = await prisma.server.findUnique({
        where: {
            id: serverId,
        },
        include: {
            channels: {
                orderBy: {
                    createdAt: "asc",
                },
            },
            members: {
                include: {
                    profile: true,
                },
                orderBy: {
                    role: "asc",
                },
            },
        },
    });
    if (!server) {
        return redirect("/sign-in");
    }

    const userMember = await prisma.member.findFirst({
        where: {
            serverId: serverId,
            profileId: profile.id,
        },
        select: {
            role: true,
        },
    });

    const textChannels = server.channels.filter(
        (channel) => channel.type === ChannelType.TEXT,
    );
    const voiceChannels = server.channels.filter(
        (channel) => channel.type === ChannelType.AUDIO || channel.type === ChannelType.VIDEO,
    );
    const members = server.members.filter(
        (user) => user.profileId !== profile.id,
    );
    const role = server.profileId === profile.id 
        ? MemberRole.ADMIN 
        : (server.members.find((member) => member.profileId === profile.id)?.role || MemberRole.GUEST);
        
    const headerRole = server.profileId === profile.id 
        ? MemberRole.ADMIN 
        : (userMember?.role || MemberRole.GUEST);

    return (
        <div className="flex flex-col h-full text-primary w-full bg-secondary border-r">
            <ServerHeader server={server} role={headerRole} />

            <ScrollArea className="flex-1 px-3">
                <div className="my-2">
                    <ServerSearch
                        serverId={serverId}
                        data={[
                            {
                                label: "Text Channels",
                                type: "channel",
                                data: textChannels?.map((channel) => ({
                                    id: channel.id,
                                    name: channel.name,
                                    icon: iconMap[channel.type],
                                })),
                            },
                            {
                                label: "Voice Channels",
                                type: "channel",
                                data: voiceChannels?.map((channel) => ({
                                    id: channel.id,
                                    name: channel.name,
                                    icon: iconMap[channel.type],
                                })),
                            },
                            {
                                label: "Members",
                                type: "member",
                                data: server.members?.map((member) => ({
                                    id: member.id,
                                    name: member.profile.name,
                                    icon: roleIconMap[member.role],
                                })),
                            },
                        ]}
                    />
                </div>
                <Separator />

                <div className="mt-2">
                    {(textChannels.length > 0 || role !== MemberRole.GUEST) && (
                        <>
                            <ServerSection
                                sectionType="channels"
                                channelType={ChannelType.TEXT}
                                role={role}
                                label="Text Channels"
                                server={server}
                            />
                            {textChannels.map((channel) => (
                                <ServerChannel
                                    key={channel.id}
                                    channel={channel}
                                    role={role}
                                    server={server}
                                />
                            ))}
                        </>
                    )}
                </div>
                <div className="mt-2">
                    {(voiceChannels.length > 0 || role !== MemberRole.GUEST) && (
                        <>
                            <ServerSection
                                sectionType="channels"
                                channelType={ChannelType.AUDIO}
                                role={role}
                                label="Voice Channels"
                                server={server}
                            />
                            {voiceChannels.map((channel) => (
                                <ServerChannel
                                    key={channel.id}
                                    channel={channel}
                                    role={role}
                                    server={server}
                                />
                            ))}
                        </>
                    )}
                </div>

                <div className="mt-2">
                    {((members && members.length > 0) || role === MemberRole.ADMIN) && (
                        <>
                            <ServerSection
                                sectionType="members"
                                role={role}
                                label="Members"
                                server={server}
                            />
                            {members.map((member) => (
                                <ServerMember
                                    key={member.id}
                                    server={server}
                                    member={member}
                                />
                            ))}
                        </>
                    )}
                </div>
            </ScrollArea>
            {/* Analytics shortcut */}
            <div className="p-2 border-t border-primary/10">
                <Link
                    href={`/servers/${serverId}/analytics`}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 transition-colors group"
                >
                    <Network className="h-4 w-4 group-hover:animate-pulse" />
                    Core Control Center
                </Link>
            </div>
        </div>
    );
};

export default ServerSidebar;
