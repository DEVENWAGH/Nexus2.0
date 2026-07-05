import { Navbar } from "@/components/navbar";
import { CTAButton } from "@/components/landing/cta-button";
import { LandingContent } from "@/components/landing/landing-content";

export default function Home() {
    return (
        <>
            <Navbar />
            <LandingContent
                ctaSlot={<CTAButton />}
                ctaSlotSecondary={<CTAButton variant="secondary" />}
            />
        </>
    );
}
