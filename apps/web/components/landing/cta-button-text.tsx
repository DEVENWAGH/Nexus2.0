"use client";

import { useT } from "@/components/providers/language-context";

interface CTAButtonTextProps {
    translationKey: "hero.createAccount" | "hero.loginToNexus" | "hero.goToProfile";
}

export function CTAButtonText({ translationKey }: CTAButtonTextProps) {
    const t = useT();
    return <>{t(translationKey)}</>;
}
