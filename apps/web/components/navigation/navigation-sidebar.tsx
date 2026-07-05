import { redirect } from "next/navigation";
import Link from "next/link";
import { CurrentProfile } from "@/lib/current-profile";
import { prisma } from "@repo/db";
import NavigationAction from "./navigation-action";
import { Separator } from "../ui/separator";
import { ScrollArea } from "../ui/scroll-area";
import NavigationItems from "./navigation-items";
import { ModeToggle } from "../ModeToggle";
import { ClerkUserButton } from "../clerk-user-button";
import { HomeIcon } from "lucide-react";
import { Button } from "../ui/button";

const NavigationSidebar = async () => {
    const profile = await CurrentProfile();
    if (!profile) {
        return redirect("/");
    }

    const servers = await prisma.server.findMany({
        where: {
            members: {
                some: {
                    profileId: profile.id,
                },
            },
        },
    });

    return (
        <nav
            aria-label="Server sidebar"
            className="flex flex-col items-center h-full text-primary bg-secondary/80 backdrop-blur-sm py-4 border-r border-primary/5"
        >
            <div className="flex flex-col items-center w-full space-y-4 mb-2">
                <NavigationAction />
                <Separator className="bg-primary/10 rounded-full w-10 mx-auto" />
            </div>

            <ScrollArea className="flex-1 w-full">
                <ul className="flex flex-col items-center gap-y-3 py-2">
                    {servers.length === 0 ? (
                        <li className="text-[10px] font-medium uppercase text-muted-foreground/60 px-2 text-center mt-4">
                            No servers
                        </li>
                    ) : (
                        servers.map((server) => (
                            <li key={server.id} className="w-full">
                                <NavigationItems
                                    id={server.id}
                                    name={server.name}
                                    imageUrl={server.imageUrl}
                                />
                            </li>
                        ))
                    )}
                </ul>
            </ScrollArea>

            <div className="w-full space-y-4 mt-auto flex flex-col items-center">
                <Separator className="bg-primary/10 rounded-full w-10 mx-auto" />
                <div className="flex items-center flex-col gap-y-4 w-full">
                    <ModeToggle />

                    <Button
                        variant="outline"
                        size="icon"
                        asChild
                        className="hover:bg-primary/5 rounded-2xl transition-all active:scale-90 opacity-80 hover:opacity-100"
                    >
                        <Link href="/">
                            <HomeIcon className="h-5 w-5 " />
                        </Link>
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        className="hover:bg-primary/5 rounded-2xl transition-all active:scale-90 opacity-80 hover:opacity-100"
                    >
                        <ClerkUserButton />
                    </Button>
                </div>
            </div>
        </nav>
    );
};

export default NavigationSidebar;
