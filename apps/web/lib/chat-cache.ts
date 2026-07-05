import type { InfiniteData } from "@tanstack/react-query";

type ChatPage<T> = { items: T[] };

/**
 * Insert or update a message in the infinite-query chat cache.
 * Prevents duplicate entries when the same id arrives via REST, Socket.IO, or P2P.
 */
export function upsertChatMessage<T extends { id: string }>(
    oldData: InfiniteData<ChatPage<T>> | undefined,
    message: T,
): InfiniteData<ChatPage<T>> {
    if (!oldData?.pages?.length) {
        return {
            pages: [{ items: [message] }],
            pageParams: oldData?.pageParams ?? [],
        };
    }

    let found = false;
    const pages = oldData.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
            if (item.id === message.id) {
                found = true;
                return message;
            }
            return item;
        }),
    }));

    if (found) {
        return { ...oldData, pages };
    }

    const newPages = [...pages];
    newPages[0] = {
        ...newPages[0],
        items: [message, ...newPages[0].items],
    };

    return { ...oldData, pages: newPages };
}
