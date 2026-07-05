"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useT } from "@/components/providers/language-context";
import type { TranslationKey } from "@/lib/translations";

const badgeKeys: TranslationKey[] = [
    "badge.0",
    "badge.1",
    "badge.2",
    "badge.3",
    "badge.4",
    "badge.5",
    "badge.6",
    "badge.7",
    "badge.8",
];

export function AnimatedFeatureBadge() {
    const [index, setIndex] = useState(0);
    const t = useT();

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % badgeKeys.length);
        }, 2000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="inline-flex items-center rounded-full border border-primary-color/20 bg-primary-color/5 px-4 py-1.5 text-sm font-medium text-primary-color transition-colors hover:bg-primary-color/10 justify-center">
            <div className="relative h-5 flex items-center justify-center overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.span
                        key={index}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="whitespace-nowrap flex items-center"
                    >
                        <span className="flex h-2 w-2 rounded-full bg-primary-color mr-3 animate-pulse shrink-0"></span>
                        {t(badgeKeys[index]!)}
                    </motion.span>
                </AnimatePresence>
            </div>
        </div>
    );
}
