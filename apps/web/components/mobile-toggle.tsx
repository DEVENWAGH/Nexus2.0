import { Menu } from "lucide-react";

import {
    Sheet,
    SheetTrigger,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "./ui/button";
import NavigationSidebar from "./navigation/navigation-sidebar";
import ServerSidebar from "./server/server-sidebar";

type MobileToggleProps = { serverId: string };

const MobileToggle = ({ serverId }: MobileToggleProps) => {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden mr-2">
                    <Menu />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 flex gap-0">
                <SheetHeader className="sr-only">
                    <SheetTitle>Navigation</SheetTitle>
                    <SheetDescription>
                        Open navigation and server list
                    </SheetDescription>
                </SheetHeader>
                <div className="flex h-full">
                    <div className="w-18 h-full">
                        <NavigationSidebar />
                    </div>
                    <ServerSidebar serverId={serverId} />
                </div>
            </SheetContent>
        </Sheet>
    );
};

export default MobileToggle;
