"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    type ReactNode,
} from "react";
import {
    requiresSendConfirmation,
    scanText,
    type ScanResult,
} from "@/lib/client-content-scan";

type ContentScanContextValue = {
    scanOutgoing: (text: string) => Promise<ScanResult>;
    scanIncoming: (text: string) => Promise<ScanResult>;
    requiresConfirmation: (result: ScanResult) => boolean;
};

const ContentScanContext = createContext<ContentScanContextValue | null>(null);

export function ContentScanProvider({ children }: { children: ReactNode }) {
    const scanOutgoing = useCallback(async (text: string) => scanText(text), []);
    const scanIncoming = useCallback(async (text: string) => scanText(text), []);
    const requiresConfirmation = useCallback(
        (result: ScanResult) => requiresSendConfirmation(result),
        [],
    );

    const value = useMemo(
        () => ({ scanOutgoing, scanIncoming, requiresConfirmation }),
        [scanOutgoing, scanIncoming, requiresConfirmation],
    );

    return (
        <ContentScanContext.Provider value={value}>
            {children}
        </ContentScanContext.Provider>
    );
}

export function useContentScan() {
    const ctx = useContext(ContentScanContext);
    if (!ctx) {
        throw new Error("useContentScan must be used within ContentScanProvider");
    }
    return ctx;
}
