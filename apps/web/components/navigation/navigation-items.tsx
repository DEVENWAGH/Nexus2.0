"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ActionTooltip from "../action-tooltip";
import { useUnread } from "@/components/providers/unread-provider";

interface navigationItemProps {
    id: string;
    imageUrl: string;
    name: string;
}

const NavigationItems = ({ id, imageUrl, name }: navigationItemProps) => {
    const params = useParams();
    const router = useRouter();
    const { getServerUnreadCount } = useUnread();

    const unreadCount = getServerUnreadCount(id);

    const onClick = () => {
        router.push(`/servers/${id}`);
    };

    return (
        <ActionTooltip side="right" align="center" label={name}>
            <button
                onClick={onClick}
                className="group relative flex items-center transition-all active:scale-95 w-full"
            >
                <div
                    className={cn(
                        "absolute left-0 bg-primary rounded-r-full transition-all w-1",
                        params?.serverId !== id && "group-hover:h-5",
                        params?.serverId === id ? "h-9" : "h-0",
                    )}
                />
                <div className="relative mx-auto">
                    <div
                        className={cn(
                            "relative group flex h-12 w-12 rounded-[24px] group-hover:rounded-3xl transition-all overflow-hidden border border-primary/10 cursor-pointer",
                            params?.serverId === id &&
                                "bg-primary/10 text-primary rounded-3xl shadow-lg shadow-primary/5 border-primary/20",
                        )}
                    >
                        <Image
                            fill
                            src={imageUrl}
                            alt="Server"
                            unoptimized
                            className="transition-transform group-hover:scale-110 object-cover"
                        />
                    </div>
                    {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 z-10 bg-rose-500 text-white rounded-full text-[9px] font-extrabold h-5 min-w-5 px-1 flex items-center justify-center border-2 border-secondary shadow-md animate-pulse">
                            {unreadCount}
                        </span>
                    )}
                </div>
            </button>
        </ActionTooltip>
    );
};

export default NavigationItems;
