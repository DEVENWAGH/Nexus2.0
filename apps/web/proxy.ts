import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@repo/auth";

export async function proxy(request: NextRequest) {
    const session = request.cookies.get("__session")?.value;
    let isValidSession = false;

    if (session) {
        const claims = await verifySessionToken(session);
        isValidSession = Boolean(claims?.sub);
    }

    const isAuthPage =
        request.nextUrl.pathname.startsWith("/sign-in") ||
        request.nextUrl.pathname.startsWith("/sign-up");
    const isApiRoute =
        request.nextUrl.pathname.startsWith("/api") ||
        request.nextUrl.pathname.startsWith("/trpc");

    if (!isValidSession && !isAuthPage && !isApiRoute && request.nextUrl.pathname !== "/") {
        return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    if (isValidSession && isAuthPage) {
        return NextResponse.redirect(new URL("/setup", request.url));
    }

    if (session && !isValidSession && !isAuthPage) {
        const response = NextResponse.redirect(new URL("/sign-in", request.url));
        response.cookies.set("__session", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 0,
            sameSite: "lax",
        });
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
    ],
};
