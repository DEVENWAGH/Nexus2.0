import type { NextConfig } from "next";

// Node API backend URL (replaces legacy Python Nexus_backend)
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
    /* config options here */
    output: "standalone",
    reactCompiler: true,
    transpilePackages: ["@repo/db", "@repo/p2p", "@repo/auth"],
    // Prevent Prisma from being bundled into the client-side (browser) bundle.
    // Prisma's generated client requires Node.js APIs and cannot run in the browser.
    serverExternalPackages: ["@prisma/client", ".prisma/client"],

    images: {
        remotePatterns: [
            { hostname: "uploadthing.com" },
            { hostname: "z4hrk2n1pd.ufs.sh" },
            { hostname: "6fobib5koe.ufs.sh" },
            { hostname: "ui-avatars.com" },
        ],
    },

    // Proxy API routes to the Node API backend BEFORE checking local Next.js API routes
    async rewrites() {
        return {
            beforeFiles: [
                // Chat messages (channel messages)
                {
                    source: "/api/messages/:path*",
                    destination: `${BACKEND_URL}/api/messages/:path*`,
                },
                {
                    source: "/api/messages",
                    destination: `${BACKEND_URL}/api/messages`,
                },
                // Direct messages
                {
                    source: "/api/direct-messages/:path*",
                    destination: `${BACKEND_URL}/api/direct-messages/:path*`,
                },
                {
                    source: "/api/direct-messages",
                    destination: `${BACKEND_URL}/api/direct-messages`,
                },
                // Server management
                {
                    source: "/api/servers/:path*",
                    destination: `${BACKEND_URL}/api/servers/:path*`,
                },
                {
                    source: "/api/servers",
                    destination: `${BACKEND_URL}/api/servers`,
                },
                // Channel management
                {
                    source: "/api/channels/:path*",
                    destination: `${BACKEND_URL}/api/channels/:path*`,
                },
                {
                    source: "/api/channels",
                    destination: `${BACKEND_URL}/api/channels`,
                },
                // Member management
                {
                    source: "/api/members/:path*",
                    destination: `${BACKEND_URL}/api/members/:path*`,
                },
                {
                    source: "/api/members",
                    destination: `${BACKEND_URL}/api/members`,
                },
                // Conversations (DM creation)
                {
                    source: "/api/conversations",
                    destination: `${BACKEND_URL}/api/conversations`,
                },
                {
                    source: "/api/signaling/:path*",
                    destination: `${BACKEND_URL}/api/signaling/:path*`,
                },
                // Profile
                {
                    source: "/api/profile/:path*",
                    destination: `${BACKEND_URL}/api/profile/:path*`,
                },
                // Blockchain status
                {
                    source: "/api/blockchain/:path*",
                    destination: `${BACKEND_URL}/api/blockchain/:path*`,
                },
                // Users status
                {
                    source: "/api/users/:path*",
                    destination: `${BACKEND_URL}/api/users/:path*`,
                },
                // Steganography
                {
                    source: "/api/steganography/:path*",
                    destination: `${BACKEND_URL}/api/steganography/:path*`,
                },
                // NOTE: /api/chat/ai is handled by the Next.js route handler (not proxied)
            ]
        };
    },
};

export default nextConfig;
