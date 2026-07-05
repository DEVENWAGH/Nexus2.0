"use client";

import { useLanguage } from "@/components/providers/language-context";

export function LanguageSwitcher() {
    const { locale, setLocale } = useLanguage();

    return (
        <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1 bg-white/70 dark:bg-brand-canvas/70 backdrop-blur-md border border-slate-200/50 dark:border-surface-indigo/35 p-1 rounded-full shadow-sm">
            <button
                onClick={() => setLocale("hi")}
                className={`w-8 h-8 rounded-full text-[10px] md:text-xs font-display font-bold uppercase transition-all relative flex items-center justify-center ${
                    locale === "hi" ? "text-slate-900 dark:text-white bg-white dark:bg-surface-indigo shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
            >
                hi
            </button>
            <button
                onClick={() => setLocale("en")}
                className={`w-8 h-8 rounded-full text-[10px] md:text-xs font-display font-bold uppercase transition-all relative flex items-center justify-center ${
                    locale === "en" ? "text-slate-900 dark:text-white bg-white dark:bg-surface-indigo shadow-sm" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
            >
                en
            </button>
        </div>
    );
}
