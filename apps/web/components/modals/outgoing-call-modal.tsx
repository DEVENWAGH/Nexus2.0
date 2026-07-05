"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/user-avatar";
import { PhoneOff } from "lucide-react";
import { useCall } from "@/hooks/use-call";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export const OutgoingCallModal = () => {
    const { callState, cancelCall } = useCall();
    const [timeLeft, setTimeLeft] = useState(30);

    useEffect(() => {
        if (!callState.initiatedAt || !callState.isOutgoing) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - callState.initiatedAt!) / 1000);
            const remaining = Math.max(0, 30 - elapsed);
            setTimeLeft(remaining);

            if (remaining === 0) {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [callState.initiatedAt, callState.isOutgoing]);

    // Show modal as soon as we're in outgoing state, don't wait for callId
    const isOpen = callState.isOutgoing;

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen}>
            <DialogContent
                showCloseButton={false}
                className="bg-background text-foreground p-6 max-w-md"
            >
                <DialogHeader>
                    <DialogTitle className="text-2xl text-center font-semibold">
                        Calling...
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center space-y-6 py-4">
                    <div className="flex flex-col items-center space-y-3">
                        <UserAvatar
                            src={callState.recipientImage}
                            name={callState.recipientName}
                            className="h-24 w-24"
                        />
                        <div className="text-center">
                            <p className="text-xl font-semibold">
                                {callState.recipientName}
                            </p>
                            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Ringing...</span>
                            </div>
                            <p className="text-xs font-semibold text-rose-500 mt-1">
                                Cancelling in {timeLeft}s
                            </p>
                        </div>
                    </div>

                    <div className="pt-4">
                        <Button
                            onClick={() =>
                                callState.callId && cancelCall(callState.callId)
                            }
                            variant="destructive"
                            size="lg"
                            className="rounded-full h-16 w-16 p-0"
                        >
                            <PhoneOff className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
