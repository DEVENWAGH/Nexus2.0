"use client";

import { Hash, User } from "lucide-react";

const ChatWelcome = ({
    type,
    name,
}: {
    type: "channel" | "conversation";
    name: string;
}) => {
    const isChannel = type === "channel";
    const title = isChannel ? `Welcome to #${name}` : name;
    const subtitle = isChannel
        ? `This is the start of the #${name} channel. Start the conversation by sending a message.`
        : `This is the start of your conversation with #${name}.`;

    return (
        <div className="space-y-2 px-4 mb-4">
            <div className="h-[68px] w-[68px] rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                {isChannel ? (
                    <Hash className="h-9 w-9 text-zinc-600 dark:text-white" />
                ) : (
                    <User className="h-9 w-9 text-zinc-600 dark:text-white" />
                )}
            </div>

            <p className="text-xl md:text-3xl font-bold text-zinc-900 dark:text-white mt-4">
                {title}
            </p>

            <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                {subtitle}
            </p>
        </div>
    );
};

export default ChatWelcome;
