"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import ActionTooltip from "../action-tooltip";

export const CronCountdownHeader = () => {
    const [msLeft, setMsLeft] = useState(0);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            const next = new Date(now);
            next.setHours(24, 0, 0, 0); // next midnight
            setMsLeft(next.getTime() - now.getTime());
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const h = Math.floor(msLeft / 3_600_000);
    const m = Math.floor((msLeft % 3_600_000) / 60_000);
    const s = Math.floor((msLeft % 60_000) / 1_000);
    const fmt = (n: number) => String(n).padStart(2, "0");

    const isUrgent = h === 0 && m < 30;
    const isWarning = h < 2;

    const colorClasses = isUrgent
        ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
        : isWarning
        ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
        : "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400";

    const timerColor = isUrgent
        ? "text-rose-500 animate-pulse"
        : isWarning
        ? "text-amber-500"
        : "text-indigo-500";

    const labelText = `Auto-Delete Countdown: All messages in this platform automatically self-destruct 24 hours after being sent. The database permanently purges all expired messages when this timer reaches 00:00:00.`;

    return (
        <ActionTooltip side="bottom" label={labelText}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all duration-300 select-none mr-3 ${colorClasses}`}>
                <Timer className={`w-3.5 h-3.5 ${timerColor}`} />
                <span className="hidden md:inline text-zinc-500 dark:text-zinc-400 font-medium">Auto-Delete in</span>
                <span className="font-bold tabular-nums">
                    {fmt(h)}:{fmt(m)}:{fmt(s)}
                </span>
            </div>
        </ActionTooltip>
    );
};
