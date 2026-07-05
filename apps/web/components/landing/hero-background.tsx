"use client";

import { lazy, Suspense } from "react";

const DottedGlowBackgroundLazy = lazy(() =>
    import("@/components/ui/dotted-glow-background").then((mod) => ({
        default: mod.DottedGlowBackground,
    })),
);

export function HeroBackground() {
    return (
        <Suspense fallback={<div className="absolute inset-0" />}>
            <DottedGlowBackgroundLazy
                colorLightVar="--primary-color"
                colorDarkVar="--muted-foreground"
                glowColorLightVar="--primary-color"
                glowColorDarkVar="--primary-color"
            />
        </Suspense>
    );
}
