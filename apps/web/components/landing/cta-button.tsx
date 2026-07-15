import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { CTAButtonText } from "@/components/landing/cta-button-text";
import { getAuth } from "@/lib/auth-wrapper";

interface CTAButtonProps {
    size?: "default" | "sm" | "lg" | "icon";
    variant?: "default" | "secondary";
}

export async function CTAButton({
    size = "lg",
}: CTAButtonProps) {
    const { userId } = await getAuth();

    return (
        <>
            {!userId ? (
                <Link href="/sign-in" className="w-full sm:w-auto">
                    <Button
                        size={size}
                        className="h-14 px-8 text-base bg-brand-green hover:bg-brand-green/90 text-ink-dark hover:scale-[1.02] font-display font-extrabold uppercase tracking-wider rounded-sm shadow-lg shadow-brand-green/20 transition-all duration-300 w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-brand-green"
                    >
                        <LayoutDashboard className="mr-2 h-5 w-5" />
                        <CTAButtonText translationKey="hero.loginToNexus" />
                    </Button>
                </Link>
            ) : (
                <Link href="/setup" className="w-full sm:w-auto">
                    <Button
                        size={size}
                        className="h-14 px-8 text-base bg-brand-green hover:bg-brand-green/90 text-ink-dark hover:scale-[1.02] font-display font-extrabold uppercase tracking-wider rounded-sm shadow-lg shadow-brand-green/20 transition-all duration-300 w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-brand-green"
                    >
                        <LayoutDashboard className="mr-2 h-5 w-5" />
                        <CTAButtonText translationKey="hero.goToProfile" />
                    </Button>
                </Link>
            )}
        </>
    );
}
