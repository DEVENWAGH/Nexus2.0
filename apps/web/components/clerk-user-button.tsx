"use client";

import { UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export const ClerkUserButton = () => {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        );
    }

    return (
        <UserButton
            afterSignOutUrl="/"
            appearance={{
                elements: {
                    avatarBox: "h-8 w-8",
                },
            }}
        />
    );
};
