"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type SecurityConfirmModalProps = {
    open: boolean;
    reasons: string[];
    source?: string;
    score?: number;
    onCancel: () => void;
    onConfirm: () => void;
};

export function SecurityConfirmModal({
    open,
    reasons,
    source,
    score,
    onCancel,
    onConfirm,
}: SecurityConfirmModalProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="bg-background border-border max-w-md">
                <DialogHeader>
                    <DialogTitle>Suspicious message detected</DialogTitle>
                    <DialogDescription>
                        This message matched security rules or the local AI classifier.
                        You can cancel or send anyway.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                    {source && (
                        <p className="text-muted-foreground">
                            Source: {source}
                            {typeof score === "number" && score > 0
                                ? ` · score ${(score * 100).toFixed(1)}%`
                                : ""}
                        </p>
                    )}
                    <ul className="list-disc pl-5 space-y-1 text-foreground/90">
                        {reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                        ))}
                    </ul>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm}>Send anyway</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
