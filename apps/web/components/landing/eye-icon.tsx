"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

export function EyeIcon() {
    const eyeRef = useRef<HTMLSpanElement>(null);
    const [pupilPos, setPupilPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!eyeRef.current) return;
            const rect = eyeRef.current.getBoundingClientRect();
            const eyeCenterX = rect.left + rect.width / 2;
            const eyeCenterY = rect.top + rect.height / 2;

            const angle = Math.atan2(e.clientY - eyeCenterY, e.clientX - eyeCenterX);
            const dist = Math.hypot(e.clientX - eyeCenterX, e.clientY - eyeCenterY);
            
            // Constrain movement based on viewport size
            const maxTranslationX = window.innerWidth >= 1024 ? 14 : window.innerWidth >= 768 ? 8 : 4;
            const maxTranslationY = window.innerWidth >= 1024 ? 6 : window.innerWidth >= 768 ? 4 : 2;

            // Sensitivity radius
            const sensitivity = 400;
            const ratio = Math.min(dist / sensitivity, 1);

            setPupilPos({
                x: Math.cos(angle) * maxTranslationX * ratio,
                y: Math.sin(angle) * maxTranslationY * ratio
            });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <span
            ref={eyeRef}
            className="w-[32px] h-[18px] md:w-[54px] md:h-[28px] lg:w-[74px] lg:h-[38px] border-[2px] md:border-[3px] border-slate-950 dark:border-white rounded-full inline-flex items-center justify-center mx-2 md:mx-3 relative overflow-hidden bg-white/50 dark:bg-black/50 shadow-inner align-middle"
        >
            <motion.span
                animate={{ x: pupilPos.x, y: pupilPos.y }}
                transition={{ type: "spring", stiffness: 220, damping: 20 }}
                className="w-1.5 h-1.5 md:w-2.5 md:h-2.5 lg:w-3.5 lg:h-3.5 bg-slate-950 dark:bg-white rounded-full absolute"
            />
        </span>
    );
}
