"use client";

import { useState, useEffect } from "react";
import { getOrCreateIdentity } from "@/hooks/use-identity";

export function useAuth() {
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const hasSession = typeof document !== "undefined" && (document.cookie.includes("__session=") || document.cookie.includes("nexus_session=1"));
        const stored = typeof window !== "undefined" ? localStorage.getItem("nexus-user-id") : null;

        if (stored) {
            // If stored ID is a wallet address but session cookie is missing, clear it
            if (!stored.startsWith("did:key:") && !hasSession) {
                if (typeof window !== "undefined") {
                    localStorage.removeItem("nexus-user-id");
                }
            } else {
                setUserId(stored);
            }
        }

        if (hasSession && (!stored || stored.startsWith("did:key:"))) {
            fetch("/api/profile")
                .then((r) => (r.ok ? r.json() : null))
                .then((profile) => {
                    if (profile?.userId && isMounted) {
                        if (typeof window !== "undefined") {
                            localStorage.setItem("nexus-user-id", profile.userId);
                        }
                        setUserId(profile.userId);
                    }
                })
                .catch(() => {});
        } else if (!hasSession) {
            getOrCreateIdentity()
                .then((identity) => {
                    if (!isMounted) return;
                    const currentStored = typeof window !== "undefined" ? localStorage.getItem("nexus-user-id") : null;
                    if (!currentStored || currentStored.startsWith("did:key:")) {
                        if (typeof window !== "undefined") {
                            localStorage.setItem("nexus-user-id", identity.did);
                        }
                        setUserId(identity.did);
                    }
                })
                .catch(console.error);
        }

        return () => {
            isMounted = false;
        };
    }, []);

    return { userId };
}

export function useUser() {
    const { userId } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setIsLoading(false);
            return;
        }

        const shortId = userId.startsWith("did:key:z") ? userId.slice(9, 17) : userId.slice(0, 8);
        setProfile({
            id: userId,
            firstName: `Node-${shortId}`,
            lastName: "",
            imageUrl: `https://ui-avatars.com/api/?name=${shortId}&background=0D8ABC&color=fff`,
            fullName: `Peer Node ${shortId}`,
            username: `node_${shortId}`,
        });
        setIsLoading(false);
    }, [userId]);

    const hasSession = typeof document !== "undefined" && (document.cookie.includes("__session=") || document.cookie.includes("nexus_session=1"));

    return {
        user: profile,
        isLoaded: !isLoading,
        isSignedIn: hasSession && !!userId && !userId.startsWith("did:key:"),
    };
}
