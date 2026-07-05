"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useModal } from "@/hooks/use-mode-store";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";

const LeaveServerModal = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { isOpen, onClose, type, data } = useModal();
    const router = useRouter();
    const { userId } = useAuth();
    const isModalOpen = isOpen && type == "leaveServer";
    const { server } = data;

    async function onConfirm() {
        if (!server?.id) {
            toast.error("Server not found. Please try again.");
            return;
        }

        try {
            setIsLoading(true);
            await axios.post(
                "/api/members/leave",
                { serverId: server.id },
                {
                    headers: {
                        ...(userId ? { "X-User-Id": userId } : {}),
                    },
                },
            );
            onClose();
            router.push("/");
            router.refresh();
            toast.success("You left the server.");
        } catch (error) {
            console.log(
                "unable to leave the server, try again after some time",
                error,
            );
            if (axios.isAxiosError(error) && error.response?.status === 400) {
                toast.error(
                    (error.response.data as { error?: string })?.error ??
                        "Admin cannot leave. Transfer ownership first.",
                );
            } else {
                toast.error("Unable to leave the server. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="bg-background text-foreground p-0 overflow-hidden max-w-md sm:max-w-md">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Leave this server
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        Are you sure you want to leave the server{" "}
                        <span className="font-semibold">{server?.name}</span>?
                    </DialogDescription>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                        You will lose access to this server and its channels.
                    </p>
                </DialogHeader>
                <DialogFooter className="items-center gap-3 px-6 pb-6 justify-end">
                    <Button
                        size="sm"
                        disabled={isLoading}
                        onClick={onClose}
                        variant={"ghost"}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        disabled={isLoading}
                        onClick={onConfirm}
                        variant={"destructive"}
                        className="flex items-center"
                    >
                        {isLoading ? <Spinner className="mr-2" /> : null}
                        {isLoading ? "Leaving..." : "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default LeaveServerModal;
