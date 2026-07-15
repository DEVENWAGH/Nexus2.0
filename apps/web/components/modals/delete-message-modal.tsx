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
import qs from "query-string";
import { useAuth } from "@/hooks/use-auth";

const DeleteMessageModal = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { isOpen, onClose, type, data } = useModal();
    const isModalOpen = isOpen && type == "deleteMessage";
    const { apiUrl, query } = data;
    const { userId } = useAuth();

    async function onConfirm() {
        try {
            setIsLoading(true);
            const url = qs.stringifyUrl({
                url: apiUrl || "",
                query: query,
            });

            await axios.delete(url, {
                headers: {
                    ...(userId ? { "X-User-Id": userId } : {}),
                },
            });
            onClose();
        } catch (error) {
            console.log(
                "unable to delete the server, try again after some time",
                error,
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="bg-background text-foreground p-0 overflow-hidden max-w-md sm:max-w-md">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Delete message
                    </DialogTitle>
                    <DialogDescription className="text-center text-muted-foreground">
                        Are you sure you want to delete this message
                    </DialogDescription>
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
                        {isLoading ? "Deleting..." : "Yes, delete"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DeleteMessageModal;
