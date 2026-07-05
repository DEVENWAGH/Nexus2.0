import ChatHeader from "@/components/chat/chat-header";
import ChatInput from "@/components/chat/chat-input";
import ChatMessages from "@/components/chat/chat-messages";
import { ChatContentWrapper } from "@/components/chat/chat-content-wrapper";
import { P2PChatBridge } from "@/components/chat/p2p-chat-bridge";
import { MediaRoom } from "@/components/media-client";
import { CurrentProfile } from "@/lib/current-profile";
import { prisma, MemberRole } from "@repo/db";
import { redirect } from "next/navigation";
import MobileToggle from "@/components/mobile-toggle";

const ChannelPage = async ({
    params,
}: {
    params: Promise<{ channelId: string; serverId: string }>;
}) => {
    const { channelId, serverId } = await params;
    const profile = await CurrentProfile();
    if (!profile) {
        redirect("/sign-in");
    }

    const channel = await prisma.channel.findUnique({
        where: {
            id: channelId,
        },
    });

    const member = await prisma.member.findFirst({
        where: {
            serverId: serverId,
            profileId: profile.id,
        },
    });
    if (!channel || !member) {
        redirect("/");
    }

    const server = await prisma.server.findUnique({
        where: {
            id: serverId,
        },
        include: {
            members: {
                include: {
                    profile: true,
                },
            },
        },
    });

    const role = server?.profileId === profile.id ? MemberRole.ADMIN : member.role;

    return (
        <div className="flex flex-col h-full w-full min-w-0">
            <ChatHeader
                name={channel.name}
                serverId={channel.serverId}
                type="channel"
                channelType={channel.type}
                role={role}
                server={server || undefined}
                mobileToggle={<MobileToggle serverId={channel.serverId} />}
            />
            {channel.type === "TEXT" && (
                <P2PChatBridge
                    roomId={channelId}
                    queryKey={`chat:${channelId}`}
                    paramKey="channelId"
                    currentMember={member}
                >
                    <ChatContentWrapper>
                        <ChatMessages
                            member={member}
                            chatId={channelId}
                            name={channel.name}
                            type="channel"
                            apiUrl="/api/messages"
                            socketUrl="/api/messages"
                            socketQuery={{
                                channelId: channelId,
                                serverId: serverId,
                            }}
                            paramKey="channelId"
                            paramValue={channelId}
                        />
                        <div className="border-t bg-secondary p-4">
                            <ChatInput
                                name={channel.name}
                                type={"channel"}
                                apiUrl={"/api/messages"}
                                query={{
                                    channelId: channel.id,
                                    serverId: serverId,
                                }}
                            />
                        </div>
                    </ChatContentWrapper>
                </P2PChatBridge>
            )}

            {(channel.type === "AUDIO" || channel.type === "VIDEO") && (
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    <MediaRoom
                        chatId={channel.id}
                        video={false}
                        audio={true}
                        channelName={channel.name}
                        currentMember={member}
                        serverId={serverId}
                        type="channel"
                    />
                </div>
            )}
        </div>
    );
};

export default ChannelPage;
