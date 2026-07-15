import ChatHeader from "@/components/chat/chat-header";
import ChatInput from "@/components/chat/chat-input";
import ChatMessages from "@/components/chat/chat-messages";
import { ChatContentWrapper } from "@/components/chat/chat-content-wrapper";
import { P2PChatBridge } from "@/components/chat/p2p-chat-bridge";
import { MediaRoom } from "@/components/media-client";
import { getOrCreateConversation } from "@/lib/conversation";
import { CurrentProfile } from "@/lib/current-profile";
import { prisma, MemberRole } from "@repo/db";
import { redirect } from "next/navigation";
import MobileToggle from "@/components/mobile-toggle";

interface ConversationPageProps {
    params: Promise<{ conversationId: string; serverId: string }>;
    searchParams: Promise<{ audio?: boolean }>;

}

const ConversationPage = async (props: ConversationPageProps) => {
    const params = await props.params;
    const searchParams = await props.searchParams;

    const profile = await CurrentProfile();
    if (!profile) {
        redirect("/sign-in");
    }
    const { serverId, conversationId } = params;
    const currentMember = await prisma.member.findFirst({
        where: {
            serverId: serverId,
            profileId: profile.id,
        },
        include: {
            profile: true,
        },
    });
    if (!currentMember) {
        return redirect(`/servers/${serverId}`);
    }
    const conversation = await getOrCreateConversation(
        currentMember.id,
        conversationId,
    );
    if (!conversation) {
        console.error(
            "ConversationPage: Conversation not found or could not be created",
            { currentMemberId: currentMember.id, conversationId },
        );
        return redirect(`/servers/${serverId}`);
    }
    const { memberOne, memberTwo } = conversation;
    const otherMember =
        memberOne.profileId === profile.id ? memberTwo : memberOne;

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

    const role = server?.profileId === profile.id ? MemberRole.ADMIN : currentMember.role;

    return (
        <div className="flex flex-col h-screen">
            <ChatHeader
                imageUrl={otherMember.profile.imageUrl}
                name={otherMember.profile.name}
                serverId={serverId}
                type="conversation"
                currentMemberId={currentMember.id}
                recipientUserId={otherMember.profile.userId}
                recipientMemberId={otherMember.id}
                conversationId={conversation.id}
                role={role}
                server={server || undefined}
                mobileToggle={<MobileToggle serverId={serverId} />}
            />

            {String(searchParams.audio) === "true" && (
                <MediaRoom
                    chatId={conversation.id}
                    video={false}
                    audio={true}
                    autoJoin={true}
                    channelName={otherMember.profile.name}
                    currentMember={currentMember}
                    serverId={serverId}
                    type="conversation"
                    members={server?.members}
                />
            )}

            {String(searchParams.audio) !== "true" && (

                <P2PChatBridge
                    roomId={conversation.id}
                    queryKey={`chat:${conversation.id}`}
                    paramKey="conversationId"
                    currentMember={currentMember}
                    members={server?.members}
                >
                    <ChatContentWrapper>
                        <div className="flex-1 overflow-y-auto">
                            <ChatMessages
                                member={currentMember}
                                name={otherMember.profile.name}
                                chatId={conversation.id}
                                type="conversation"
                                apiUrl="/api/direct-messages"
                                paramKey="conversationId"
                                paramValue={conversation.id}
                                socketUrl="/api/direct-messages"
                                socketQuery={{ conversationId: conversation.id }}
                            />
                        </div>

                        <div className="border-t bg-secondary p-4">
                            <ChatInput
                                name={otherMember.profile.name}
                                type={"conversation"}
                                apiUrl={"/api/direct-messages"}
                                query={{
                                    conversationId: conversation.id,
                                }}
                            />
                        </div>
                    </ChatContentWrapper>
                </P2PChatBridge>
            )}
        </div>
    );
};

export default ConversationPage;
