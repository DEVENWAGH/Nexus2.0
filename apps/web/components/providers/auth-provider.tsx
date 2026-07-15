"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import axios from "axios";

export type NexusProfile = {
    id: string;
    userId: string;
    name: string;
    imageUrl: string;
    email: string;
};

type AuthUser = {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl: string;
    fullName: string;
    username: string;
};

type AuthContextValue = {
    userId: string | null;
    profile: NexusProfile | null;
    user: AuthUser | null;
    isLoaded: boolean;
    isSignedIn: boolean;
    refreshProfile: () => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(profile: NexusProfile): AuthUser {
    const name = String(profile?.name || profile?.userId || "Wallet User");
    const parts = name.split(/\s+/).filter(Boolean);
    return {
        id: String(profile?.userId || ""),
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
        imageUrl: String(profile?.imageUrl || ""),
        fullName: name,
        username: name,
    };
}

function isValidProfile(data: unknown): data is NexusProfile {
    if (!data || typeof data !== "object") return false;
    const p = data as Record<string, unknown>;
    return typeof p.userId === "string" && p.userId.length > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<NexusProfile | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const refreshProfile = useCallback(async () => {
        try {
            const res = await axios.get("/api/profile");
            if (isValidProfile(res.data)) {
                setProfile({
                    id: String(res.data.id ?? res.data.userId),
                    userId: String(res.data.userId),
                    name: String(res.data.name ?? res.data.userId),
                    imageUrl: String(res.data.imageUrl ?? ""),
                    email: String(res.data.email ?? ""),
                });
            } else {
                setProfile(null);
            }
        } catch {
            setProfile(null);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    useEffect(() => {
        void refreshProfile();
    }, [refreshProfile]);

    const signOut = useCallback(async () => {
        try {
            await axios.post("/api/auth/logout");
            await axios.post("/api/profile/logout");
        } catch {
            // ignore network errors during logout
        }
        setProfile(null);
        setIsLoaded(true);
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            userId: profile?.userId ?? null,
            profile,
            user: profile ? toAuthUser(profile) : null,
            isLoaded,
            isSignedIn: Boolean(profile?.userId),
            refreshProfile,
            signOut,
        }),
        [profile, isLoaded, refreshProfile, signOut],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth/useUser must be used within AuthProvider");
    }
    return ctx;
}

export function useAuth() {
    const { userId, isLoaded, isSignedIn, refreshProfile, signOut } =
        useAuthContext();
    return { userId, isLoaded, isSignedIn, refreshProfile, signOut };
}

export function useUser() {
    const { user, isLoaded, isSignedIn } = useAuthContext();
    return { user, isLoaded, isSignedIn };
}
