import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
    const session = request.cookies.get("__session")?.value;

    const isAuthPage =
        request.nextUrl.pathname.startsWith("/sign-in") ||
        request.nextUrl.pathname.startsWith("/sign-up");
    const isApiRoute =
        request.nextUrl.pathname.startsWith("/api") ||
        request.nextUrl.pathname.startsWith("/trpc");

    if (!session && !isAuthPage && !isApiRoute && request.nextUrl.pathname !== "/") {
        return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    if (session && isAuthPage) {
        return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        // Always run for API routes
        "/(api|trpc)(.*)",
    ],
};
