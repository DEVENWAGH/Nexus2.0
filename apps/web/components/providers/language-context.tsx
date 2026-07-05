"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from "react";
import {
    type Locale,
    type TranslationKey,
    getTranslation,
} from "@/lib/translations";

interface LanguageContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
    undefined
);

const STORAGE_KEY = "nexus-locale";

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>("en");
    const [mounted, setMounted] = useState(false);

    // Hydrate from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
            if (stored === "hi" || stored === "en") {
                setLocaleState(stored);
            }
        } catch {
            // localStorage unavailable (SSR / private browsing)
        }
        setMounted(true);
    }, []);

    const setLocale = useCallback((newLocale: Locale) => {
        setLocaleState(newLocale);
        try {
            localStorage.setItem(STORAGE_KEY, newLocale);
        } catch {
            // localStorage unavailable
        }
        // Update html lang attribute
        if (typeof document !== "undefined") {
            document.documentElement.lang = newLocale;
        }
    }, []);

    // Set initial html lang
    useEffect(() => {
        if (mounted && typeof document !== "undefined") {
            document.documentElement.lang = locale;
        }
    }, [mounted, locale]);

    return (
        <LanguageContext.Provider value={{ locale, setLocale }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}

export function useT() {
    const { locale } = useLanguage();
    return useCallback(
        (key: TranslationKey): string => {
            return getTranslation(locale, key);
        },
        [locale]
    );
}
