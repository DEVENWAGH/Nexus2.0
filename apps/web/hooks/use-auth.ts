"use client";

import { useState, useEffect } from "react";
import axios from "axios";

export function useAuth() {
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const id = localStorage.getItem("nexus-user-id");
        setUserId(id);
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

        axios.get("/api/profile")

            .then((res) => {
                const name = res.data.name || "";
                setProfile({
                    id: res.data.userId,
                    firstName: name.split(" ")[0] || "",
                    lastName: name.split(" ").slice(1).join(" ") || "",
                    imageUrl: res.data.imageUrl,
                    fullName: name,
                    username: name,
                });
            })
            .catch(() => {
                setProfile({
                    id: userId,
                    firstName: userId.slice(0, 6),
                    lastName: "",
                    imageUrl: `https://ui-avatars.com/api/?name=${userId.slice(0, 6)}`,
                    fullName: userId.slice(0, 6),
                    username: userId.slice(0, 6),
                });
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [userId]);

    return {
        user: profile,
        isLoaded: !isLoading,
        isSignedIn: !!userId,
    };
}
