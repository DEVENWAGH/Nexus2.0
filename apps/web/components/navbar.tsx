"use client";

import { ModeToggle } from "@/components/ModeToggle";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/providers/language-context";
import { useUser } from "@/hooks/use-auth";
import { UserButton } from "@/components/user-button";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";

export const Navbar = () => {
    const t = useT();
    const { user, isLoaded, isSignedIn } = useUser();

    return (
        <nav className="fixed top-0 w-full z-50 border-b border-slate-200/40 dark:border-surface-indigo/15 bg-white/70 dark:bg-brand-canvas/70 backdrop-blur-lg shadow-[0_4px_30px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_30px_rgba(0,0,0,0.15)] transition-all duration-300">
            <div className="container flex h-16 items-center justify-between px-4 md:px-8 mx-auto">
                <Link href="/">
                    <div className="flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform duration-300 group">
                        <div className="p-1.5 bg-primary-color/10 rounded-xl group-hover:bg-primary-color/20 transition-colors duration-300">
                            <Image
                                src={"/original.jpg"}
                                alt="Nexus community"
                                width={32}
                                height={32}
                                className="object-contain rounded-md"
                            />
                        </div>
                        <span className="font-display font-extrabold text-2xl tracking-tighter leading-none text-slate-900 dark:text-white">
                            NEXUS
                        </span>
                    </div>
                </Link>

                <div className="hidden md:flex items-center gap-6">
                    <ModeToggle />
                    {!isLoaded ? (
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-20 rounded-lg animate-pulse" />
                            <Skeleton className="h-9 w-9 rounded-full animate-pulse" />
                        </div>
                    ) : isSignedIn ? (
                        <div className="flex items-center gap-4">
                            <Link href={`/setup`}>
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-primary-color hover:bg-primary-color/90 text-white font-semibold rounded-sm px-5 h-9 transition-all cursor-pointer shadow-md shadow-primary-color/20 focus-visible:ring-2 focus-visible:ring-primary-color"
                                >
                                    {t("navbar.profile")}
                                </Button>
                            </Link>
                            <UserButton />
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <Link href="/sign-in">
                                <Button
                                    size="sm"
                                    className="bg-brand-green hover:bg-brand-green/90 text-ink-dark font-semibold rounded-sm px-5 h-9 transition-all duration-300 shadow-md shadow-brand-green/20 focus-visible:ring-2 focus-visible:ring-brand-green"
                                >
                                    {t("navbar.signIn")}
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>

                {/* Mobile Menu */}
                <div className="md:hidden flex items-center gap-3">
                    <ModeToggle />
                    {!isLoaded ? (
                        <Skeleton className="h-9 w-9 rounded-full animate-pulse" />
                    ) : isSignedIn ? (
                        <UserButton />
                    ) : (
                        <Link href="/sign-in">
                            <Button
                                size="sm"
                                className="bg-brand-green hover:bg-brand-green/90 text-ink-dark font-semibold rounded-sm px-4 h-9 transition-all duration-300 shadow-md shadow-brand-green/20"
                            >
                                {t("navbar.signIn")}
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
};
