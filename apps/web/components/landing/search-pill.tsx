"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { useT } from "@/components/providers/language-context";

export function SearchPill() {
    const [searchVal, setSearchVal] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const t = useT();

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="w-full max-w-md md:max-w-lg mt-8 md:mt-12"
        >
            <div
                className={`bg-white dark:bg-slate-900/60 rounded-[6px] border p-1 pl-4 flex items-center shadow-sm transition-all duration-300 ${
                    isFocused 
                        ? "border-primary-color/40 dark:border-brand-green/45 ring-2 ring-primary-color/5 dark:ring-brand-green/5 shadow-md" 
                        : "border-slate-200 dark:border-surface-indigo/40"
                }`}
            >
                <input
                    type="text"
                    placeholder={t("hero.searchPlaceholder")}
                    value={searchVal}
                    onChange={(e) => setSearchVal(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="w-full bg-transparent outline-none text-slate-900 dark:text-white text-sm md:text-base font-sans pr-2 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                <button
                    className="bg-primary-color hover:bg-primary-color/90 dark:bg-brand-green dark:hover:bg-brand-green/90 dark:text-black text-white w-9 h-9 rounded-full relative flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                    aria-label="Search"
                >
                    <Search className="w-4 h-4" />
                </button>
            </div>
        </motion.div>
    );
}
