import NavigationSidebar from "@/components/navigation/navigation-sidebar";
import { ModalProvider } from "@/components/providers/modal-provider";
import { CallProvider } from "@/components/providers/call-provider";
import { SocketProvider } from "@/components/providers/socket-provider";
import { UnreadProvider } from "@/components/providers/unread-provider";

import { RealtimeProvider } from "@/components/providers/realtime-provider";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="h-screen flex overflow-hidden">
            <SocketProvider>
                <UnreadProvider>
                    <RealtimeProvider>
                        <div className="hidden md:flex h-full w-18 z-30 flex-col fixed inset-y-0">
                            <NavigationSidebar />
                        </div>
                        <main className="md:ml-18 flex-1 h-screen flex flex-col overflow-hidden">
                            <CallProvider>
                                <ModalProvider />
                                {children}
                            </CallProvider>
                        </main>
                    </RealtimeProvider>
                </UnreadProvider>
            </SocketProvider>
        </div>
    );
};

export default MainLayout;
