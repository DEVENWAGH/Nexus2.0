"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/user-avatar";
import { Phone, PhoneOff } from "lucide-react";
import { useCall } from "@/hooks/use-call";
import { useEffect, useState } from "react";

export const IncomingCallModal = () => {
    const { callState, acceptCall, rejectCall } = useCall();
    const [timeLeft, setTimeLeft] = useState(30);

    useEffect(() => {
        if (!callState.initiatedAt || !callState.isIncoming) return;

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
    }, [callState.initiatedAt, callState.isIncoming]);

    const isOpen = callState.isIncoming && callState.callId !== null;

    if (!isOpen || !callState.callId) return null;

    return (
        <Dialog open={isOpen}>
            <DialogContent
                showCloseButton={false}
                className="bg-background text-foreground p-6 max-w-md"
            >
                <DialogHeader>
                    <DialogTitle className="text-2xl text-center font-bold">
                        Incoming Call
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center space-y-6 py-4">
                    <div className="flex flex-col items-center space-y-3">
                        <UserAvatar
                            src={callState.callerImage}
                            name={callState.callerName}
                            className="h-24 w-24"
                        />
                        <div className="text-center">
                            <p className="text-xl font-semibold">
                                {callState.callerName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {callState.callType === "video"
                                    ? "Video call"
                                    : "Voice call"}
                            </p>
                            <p className="text-xs font-bold text-rose-500 mt-1">
                                Ends in {timeLeft}s
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                        <Button
                            onClick={() => rejectCall(callState.callId!)}
                            variant="destructive"
                            size="lg"
                            className="rounded-full h-16 w-16 p-0"
                        >
                            <PhoneOff className="h-6 w-6" />
                        </Button>
                        <Button
                            onClick={() => acceptCall(callState.callId!)}
                            className="rounded-full h-16 w-16 p-0 bg-green-600 hover:bg-green-700"
                            size="lg"
                        >
                            <Phone className="h-6 w-6" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
