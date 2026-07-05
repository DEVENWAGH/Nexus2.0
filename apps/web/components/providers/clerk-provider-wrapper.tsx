"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

export function ClerkProviderWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const { resolvedTheme } = useTheme();

    const clerkTheme = resolvedTheme === "dark" ? dark : undefined;

    return (
        <ClerkProvider appearance={{ theme: clerkTheme }}>
            {children}
        </ClerkProvider>
    );
}
