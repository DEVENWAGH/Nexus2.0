import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-context";
import { Toaster } from "@/components/ui/sonner";
import { ourFileRouter } from "@/app/api/uploadthing/core";

export const dynamic = "force-dynamic";

const spaceGrotesk = Space_Grotesk({
    variable: "--font-space-grotesk",
    subsets: ["latin"],
});

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Nexus - Community",
    description:
        "Nexus community application is a great for conversations and chilling with friends, or even building a worldwide community. Customize your own space to talk, play, and hang out.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable} antialiased`}
                suppressHydrationWarning
            >
                <NextSSRPlugin
                    routerConfig={extractRouterConfig(ourFileRouter)}
                />
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={true}
                    storageKey="nexus-theme"
                >
                    <LanguageProvider>
                        {children}
                        <Toaster />
                    </LanguageProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
