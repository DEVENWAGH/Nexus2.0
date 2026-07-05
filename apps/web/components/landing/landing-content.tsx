"use client";

import Link from "next/link";
import Image from "next/image";
import {
    Shield,
    Users,
    Zap,
    Twitter,
    Instagram,
    Facebook,
    Youtube,
    ArrowRight,
    Volume2,
    MessageSquare,
    Video,
} from "lucide-react";
import { AnimatedFeatureBadge } from "@/components/landing/animated-feature-badge";
import { FeatureSection } from "@/components/landing/feature-section";
import { EyeIcon } from "@/components/landing/eye-icon";
import { SearchPill } from "@/components/landing/search-pill";
import { LanguageSwitcher } from "@/components/landing/language-switcher";
import { ScrollReveal, ScaleReveal, HeaderReveal } from "@/components/landing/reveal-wrappers";
import { useT } from "@/components/providers/language-context";

interface LandingContentProps {
    ctaSlot: React.ReactNode;
    ctaSlotSecondary: React.ReactNode;
}

export function LandingContent({ ctaSlot, ctaSlotSecondary }: LandingContentProps) {
    const t = useT();

    return (
        <div 
            className="min-h-screen flex flex-col bg-white dark:bg-brand-canvas text-slate-900 dark:text-white font-sans selection:bg-brand-green selection:text-black overflow-x-hidden transition-colors duration-300"
            style={{
                // Scoped display font variable override for this page
                // @ts-ignore
                "--font-display": "var(--font-outfit), var(--font-space-grotesk), sans-serif",
            }}
        >
            <main className="flex-1 w-full pt-16">
                {/* Hero Section with Video Background and Gradient Mask */}
                <section className="relative w-full min-h-[105vh] sm:min-h-[115vh] pt-20 pb-20 md:pt-32 md:pb-28 lg:pt-40 lg:pb-36 bg-white dark:bg-brand-canvas overflow-hidden border-b border-slate-200/50 dark:border-surface-indigo/25 transition-colors duration-300">
                    
                    {/* Background Video Wrapper */}
                    <div className="absolute top-[12vh] sm:top-[16vh] left-0 w-full h-[85vh] sm:h-[95vh] z-0 pointer-events-none">
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full h-full object-cover opacity-20 dark:opacity-10 mix-blend-multiply dark:mix-blend-normal"
                        >
                            <source
                                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260603_132049_036591b8-6e92-4760-b94c-a7ea6eef315c.mp4"
                                type="video/mp4"
                            />
                        </video>
                        {/* Gradient Mask to blend video background into layout canvas */}
                        <div className="absolute top-0 left-0 w-full h-24 sm:h-32 bg-gradient-to-b from-white dark:from-brand-canvas to-transparent" />
                        <div className="absolute bottom-0 left-0 w-full h-24 sm:h-32 bg-gradient-to-t from-white dark:from-brand-canvas to-transparent" />
                    </div>

                    <div className="container px-4 md:px-8 mx-auto relative z-10">
                        <div className="flex flex-col items-center text-center space-y-8 max-w-5xl mx-auto">
                            {/* Animated Badge */}
                            <AnimatedFeatureBadge />

                            {/* Hero Header with Slide-up Animation and Pupil Tracking Eye Icon */}
                            <HeaderReveal className="text-4xl md:text-6xl lg:text-8xl font-display font-extrabold tracking-tighter uppercase text-slate-900 dark:text-white leading-none text-wrap-balance">
                                {t("hero.yourPlaceTo")}{" "}
                                <span className="text-brand-green relative inline-block">
                                    {t("hero.talk")}
                                </span>
                                ,{" "}
                                <span className="text-brand-magenta">
                                    {t("hero.play")}
                                </span>
                                ,{" "}
                                <span className="inline-flex items-center">
                                    {t("hero.and")}
                                    <EyeIcon />
                                </span>
                                <span className="text-primary-color block sm:inline">
                                    {t("hero.hangOut")}
                                </span>
                            </HeaderReveal>

                            <p className="mx-auto max-w-2xl text-slate-650 dark:text-slate-300 text-lg md:text-xl leading-relaxed font-medium">
                                {t("hero.subtitle")}
                            </p>

                            {/* Search Capsule Bar */}
                            <SearchPill />

                            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center pt-2">
                                {ctaSlot}
                            </div>

                            {/* Floating Geometric Element */}
                            <div className="mt-16 w-full max-w-4xl mx-auto rounded-jumbo border border-slate-200 dark:border-surface-indigo/50 bg-slate-50/50 dark:bg-surface-indigo/15 p-6 backdrop-blur-xs flex items-center justify-center relative shadow-2xl overflow-hidden aspect-21/9 min-h-[160px] md:min-h-[220px]">
                                <div className="absolute inset-0 bg-gradient-to-tr from-primary-color/10 via-transparent to-brand-magenta/10" />
                                <div className="z-10 text-center">
                                    <span className="text-5xl md:text-7xl lg:text-8xl font-display font-black bg-gradient-to-b from-slate-800 to-slate-400 dark:from-white dark:to-slate-400 bg-clip-text text-transparent select-none tracking-tighter leading-none block">
                                        NEXUS
                                    </span>
                                    <span className="text-xs md:text-sm font-display font-extrabold text-brand-green tracking-[0.3em] uppercase select-none mt-2 block">
                                        {t("hero.communitySpace")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Architectural Edge Anchors */}
                    <LanguageSwitcher />

                    {/* Bottom-Left Year Watermark */}
                    <div className="absolute bottom-6 left-8 md:left-16 z-20 select-none">
                        <span className="text-[10px] md:text-xs font-display font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500">
                            {t("hero.yearWatermark")}
                        </span>
                    </div>

                    {/* Bottom-Right Sub-heading Watermark */}
                    <div className="absolute bottom-6 right-8 md:right-16 z-20 select-none">
                        <span className="text-[10px] md:text-xs font-display font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500 uppercase">
                            {t("hero.platformWatermark")}
                        </span>
                    </div>
                </section>

                {/* Bento Grid Features with Reveal Stagger Animations */}
                <section className="py-24 bg-slate-50/40 dark:bg-surface-black/35 relative transition-colors duration-300">
                    <div className="container px-4 md:px-8 mx-auto">
                        <div className="mb-20 text-center max-w-3xl mx-auto space-y-4">
                            <span className="text-brand-green text-xs font-display font-extrabold tracking-widest uppercase bg-brand-green/10 px-3 py-1 rounded-pill">
                                {t("features.sectionBadge")}
                            </span>
                            <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight uppercase text-slate-900 dark:text-white">
                                {t("features.sectionTitle")}{" "}
                                <span className="text-primary-color">{t("features.sectionTitleHighlight")}</span>
                            </h2>
                            <p className="text-slate-600 dark:text-slate-300 text-lg">
                                {t("features.sectionSubtitle")}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Card 1 */}
                            <ScrollReveal 
                                delay={0}
                                scaleHover
                                className="flex flex-col justify-between p-10 rounded-xl bg-gradient-to-br from-brand-magenta to-primary-color text-white shadow-xl hover:shadow-2xl transition-all duration-300 group min-h-[340px] border border-white/10 relative overflow-hidden"
                            >
                                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <div className="space-y-6 z-10">
                                    <div className="p-3 bg-white/10 rounded-lg w-fit border border-white/20">
                                        <Users className="h-8 w-8 text-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-display font-extrabold uppercase tracking-tight">{t("features.card1.title")}</h3>
                                        <p className="text-white/80 leading-relaxed">
                                            {t("features.card1.description")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mt-6 pt-4 border-t border-white/10 w-fit z-10">
                                    {t("features.card1.cta")} <ArrowRight className="h-4 w-4" />
                                </div>
                            </ScrollReveal>

                            {/* Card 2 */}
                            <ScrollReveal 
                                delay={0.15}
                                scaleHover
                                className="flex flex-col justify-between p-10 rounded-xl bg-slate-50 dark:bg-surface-indigo border border-slate-200/80 dark:border-surface-indigo/60 text-slate-900 dark:text-white shadow-md hover:shadow-xl transition-all duration-300 group min-h-[340px] relative overflow-hidden"
                            >
                                <div className="space-y-6 z-10">
                                    <div className="p-3 bg-slate-200/50 dark:bg-brand-canvas/80 rounded-lg w-fit border border-slate-300/40 dark:border-surface-indigo">
                                        <Zap className="h-8 w-8 text-primary-color dark:text-brand-green" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-display font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{t("features.card2.title")}</h3>
                                        <p className="text-slate-650 dark:text-slate-300 leading-relaxed">
                                            {t("features.card2.description")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mt-6 pt-4 border-t border-slate-200/80 dark:border-surface-indigo/50 w-fit text-primary-color dark:text-brand-green z-10">
                                    {t("features.card2.cta")} <ArrowRight className="h-4 w-4" />
                                </div>
                            </ScrollReveal>

                            {/* Card 3 */}
                            <ScrollReveal 
                                delay={0.3}
                                scaleHover
                                className="flex flex-col justify-between p-10 rounded-xl bg-slate-50 dark:bg-surface-indigo border border-slate-200/80 dark:border-surface-indigo/60 text-slate-900 dark:text-white shadow-md hover:shadow-xl transition-all duration-300 group min-h-[340px] relative overflow-hidden"
                            >
                                <div className="space-y-6 z-10">
                                    <div className="p-3 bg-slate-200/50 dark:bg-brand-canvas/80 rounded-lg w-fit border border-slate-300/40 dark:border-surface-indigo">
                                        <Shield className="h-8 w-8 text-brand-magenta" />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-2xl font-display font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">{t("features.card3.title")}</h3>
                                        <p className="text-slate-650 dark:text-slate-300 leading-relaxed">
                                            {t("features.card3.description")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mt-6 pt-4 border-t border-slate-200/80 dark:border-surface-indigo/50 w-fit text-brand-magenta z-10">
                                    {t("features.card3.cta")} <ArrowRight className="h-4 w-4" />
                                </div>
                            </ScrollReveal>
                        </div>
                    </div>
                </section>

                {/* Showcase Band (Detailed CSS Web Client Mockup) */}
                <section className="py-24 bg-slate-100/50 dark:bg-surface-black border-y border-slate-200/60 dark:border-surface-indigo/25 overflow-hidden transition-colors duration-300">
                    <div className="container px-4 md:px-8 mx-auto">
                        <div className="mb-16 text-center max-w-2xl mx-auto space-y-4">
                            <h2 className="text-3xl md:text-5xl font-display font-extrabold tracking-tight uppercase text-slate-900 dark:text-white">
                                {t("showcase.title")}
                            </h2>
                            <p className="text-slate-500 dark:text-slate-400 text-lg">
                                {t("showcase.subtitle")}
                            </p>
                        </div>

                        {/* Interactive App Shell Mockup with Entrance Animation */}
                        <ScaleReveal className="relative w-full max-w-5xl mx-auto rounded-xl border border-slate-200 dark:border-surface-indigo/45 shadow-xl dark:shadow-2xl bg-white dark:bg-brand-canvas/70 backdrop-blur-md overflow-hidden aspect-video flex flex-col group min-h-[320px] transition-all duration-300">
                            {/* Window Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-surface-indigo/35 bg-slate-50 dark:bg-surface-black/80 shrink-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-red-500/80 block" aria-hidden="true"></span>
                                    <span className="w-3 h-3 rounded-full bg-yellow-500/80 block" aria-hidden="true"></span>
                                    <span className="w-3 h-3 rounded-full bg-green-500/80 block" aria-hidden="true"></span>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-display font-bold tracking-wider uppercase select-none">{t("showcase.windowTitle")}</span>
                                <div className="w-12"></div>
                            </div>

                            <div className="flex-1 flex overflow-hidden min-h-0">
                                {/* Servers Icon Bar */}
                                <div className="w-16 bg-slate-100 dark:bg-surface-black/95 flex flex-col items-center py-4 gap-3 shrink-0 border-r border-slate-200 dark:border-surface-indigo/20">
                                    <div className="w-10 h-10 rounded-xl bg-primary-color flex items-center justify-center text-white font-bold cursor-pointer hover:rounded-sm transition-all duration-300">
                                        N
                                    </div>
                                    <div className="w-8 h-[2px] bg-slate-300 dark:bg-surface-indigo/50 rounded-full" />
                                    <div className="w-10 h-10 rounded-3xl bg-slate-200 dark:bg-surface-indigo/60 hover:bg-brand-magenta/40 flex items-center justify-center text-slate-650 dark:text-slate-300 hover:text-white font-semibold cursor-pointer hover:rounded-xl transition-all duration-300">
                                        G
                                    </div>
                                    <div className="w-10 h-10 rounded-3xl bg-slate-200 dark:bg-surface-indigo/60 hover:bg-brand-green/40 flex items-center justify-center text-slate-650 dark:text-slate-300 hover:text-white font-semibold cursor-pointer hover:rounded-xl transition-all duration-300">
                                        C
                                    </div>
                                </div>

                                {/* Channel Sidebar */}
                                <div className="w-52 bg-slate-50 dark:bg-brand-canvas/95 border-r border-slate-200 dark:border-surface-indigo/20 p-4 hidden md:flex flex-col justify-between shrink-0">
                                    <div className="space-y-5">
                                        <div className="flex items-center justify-between px-1">
                                            <span className="text-[11px] font-display font-extrabold text-slate-900 dark:text-white tracking-widest uppercase">{t("showcase.communityName")}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-display font-extrabold text-slate-400 dark:text-slate-500 tracking-wider uppercase block px-2 mb-1">{t("showcase.textChannels")}</span>
                                            <div className="flex items-center gap-2 px-2 py-1.5 bg-primary-color/10 dark:bg-primary-color/20 text-primary-color dark:text-white rounded-sm text-xs font-semibold cursor-pointer border border-primary-color/20 dark:border-primary-color/30">
                                                <MessageSquare className="h-3.5 w-3.5 text-primary-color dark:text-slate-300" /> {t("showcase.general")}
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-surface-indigo/30 rounded-sm text-xs font-semibold cursor-pointer transition-colors duration-200">
                                                <MessageSquare className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {t("showcase.announcements")}
                                            </div>
                                            <span className="text-[9px] font-display font-extrabold text-slate-400 dark:text-slate-500 tracking-wider uppercase block px-2 mt-4 mb-1">{t("showcase.voiceRooms")}</span>
                                            <div className="flex items-center justify-between px-2 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-surface-indigo/30 rounded-sm text-xs font-semibold cursor-pointer transition-colors duration-200">
                                                <span className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {t("showcase.gamingLounge")}</span>
                                                <span className="text-[9px] bg-brand-green/20 text-brand-green px-1.5 py-0.5 rounded-sm">{t("showcase.active")}</span>
                                            </div>
                                            <div className="flex items-center gap-2 px-2 py-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-surface-indigo/30 rounded-sm text-xs font-semibold cursor-pointer transition-colors duration-200">
                                                <Video className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" /> {t("showcase.videoChat")}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-2 bg-slate-100 dark:bg-surface-black/60 rounded-lg flex items-center gap-2 border border-slate-200 dark:border-surface-indigo/30">
                                        <div className="relative shrink-0">
                                            <span className="w-7 h-7 rounded-full bg-brand-green flex items-center justify-center text-xs text-ink-dark font-extrabold select-none">U</span>
                                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-brand-green border-2 border-slate-50 dark:border-brand-canvas" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{t("showcase.you")}</p>
                                            <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">{t("showcase.online")}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Active Chat Window */}
                                <div className="flex-1 flex flex-col bg-white/50 dark:bg-surface-black/30 min-w-0">
                                    <div className="h-12 border-b border-slate-200 dark:border-surface-indigo/20 px-4 flex items-center justify-between bg-slate-50/20 dark:bg-surface-black/20 shrink-0">
                                        <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                                            <MessageSquare className="h-4 w-4 text-slate-500" /> {t("showcase.general")}
                                        </span>
                                    </div>
                                    <div className="flex-1 p-4 space-y-4 overflow-y-auto text-left text-xs min-h-0">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-magenta flex items-center justify-center font-bold text-white shrink-0">
                                                M
                                            </div>
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 dark:text-white">{t("showcase.msg1.name")}</span>
                                                    <span className="text-[9px] text-slate-500">{t("showcase.msg1.time")}</span>
                                                </div>
                                                <p className="text-slate-650 dark:text-slate-300">{t("showcase.msg1.text")}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary-color flex items-center justify-center font-bold text-white shrink-0">
                                                J
                                            </div>
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 dark:text-white">{t("showcase.msg2.name")}</span>
                                                    <span className="text-[9px] text-slate-500">{t("showcase.msg2.time")}</span>
                                                </div>
                                                <p className="text-slate-650 dark:text-slate-300">{t("showcase.msg2.text")}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center font-bold text-ink-dark shrink-0">
                                                C
                                            </div>
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 dark:text-white">{t("showcase.msg3.name")}</span>
                                                    <span className="text-[9px] text-slate-500">{t("showcase.msg3.time")}</span>
                                                </div>
                                                <p className="text-slate-650 dark:text-slate-300">{t("showcase.msg3.text")}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-slate-100/50 dark:bg-surface-black/60 border-t border-slate-200 dark:border-surface-indigo/20 shrink-0">
                                        <div className="bg-white border border-slate-200 dark:bg-surface-indigo/20 dark:border-surface-indigo/40 rounded-lg px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs text-left cursor-text">
                                            {t("showcase.messagePlaceholder")}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScaleReveal>
                    </div>
                </section>

                {/* Marquee Band (PLAY · CHAT · HANG OUT) */}
                <section className="w-full bg-primary-color py-6 overflow-hidden border-y border-white/10 select-none">
                    <div className="flex whitespace-nowrap">
                        <div className="marquee-content font-display font-extrabold uppercase text-2xl md:text-5xl lg:text-6xl text-white tracking-wider">
                            <span>{t("marquee.text")}</span>
                            <span aria-hidden="true">{t("marquee.text")}</span>
                        </div>
                    </div>
                </section>

                {/* Custom Alternate Feature Sections */}
                <section className="py-24 space-y-32">
                    <FeatureSection
                        imageSrc="/home/1.webp"
                        imageAlt="Organized channel listing in servers"
                        icon={Users}
                        title={t("featureSections.1.title")}
                        description={t("featureSections.1.description")}
                        features={[t("featureSections.1.feature1"), t("featureSections.1.feature2")]}
                    />

                    <FeatureSection
                        imageSrc="/home/2.webp"
                        imageAlt="Active voice connection and avatar gallery"
                        icon={Zap}
                        title={t("featureSections.2.title")}
                        description={t("featureSections.2.description")}
                        reversed
                    />

                    <FeatureSection
                        imageSrc="/home/3.webp"
                        imageAlt="Server settings and member moderation commands"
                        icon={Shield}
                        title={t("featureSections.3.title")}
                        description={t("featureSections.3.description")}
                    />
                </section>

                {/* CTA Section (Blurple panel, rounded xl) */}
                <section className="container px-4 md:px-8 mx-auto py-20 lg:py-28">
                    <div className="relative bg-primary-color rounded-xl p-10 md:p-16 lg:p-24 text-center overflow-hidden shadow-2xl border border-white/15">
                        {/* Decorative Background Elements */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-surface-black/30 via-transparent to-brand-magenta/35" />
                        <div className="absolute -top-16 -left-16 w-64 h-64 bg-white/5 rounded-full blur-2xl" />

                        <div className="space-y-8 max-w-3xl mx-auto relative z-10">
                            <h2 className="text-4xl md:text-6xl font-display font-extrabold tracking-tight uppercase leading-tight text-white">
                                {t("cta.title")}
                            </h2>
                            <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto font-sans leading-relaxed">
                                {t("cta.subtitle")}
                            </p>
                            <div className="pt-4 flex justify-center">
                                {ctaSlotSecondary}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Redesigned Footer with Watermark */}
            <footer className="py-20 bg-slate-50 dark:bg-brand-canvas border-t border-slate-200 dark:border-surface-indigo/35 relative overflow-hidden transition-colors duration-300">
                <div className="container px-4 md:px-8 mx-auto relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                        {/* Logo Column */}
                        <div className="space-y-4">
                            <Link href="/" className="flex items-center gap-3 group">
                                <div className="p-1.5 bg-primary-color/10 rounded-xl group-hover:bg-primary-color/20 transition-colors duration-300">
                                    <Image
                                        src="/original.jpg"
                                        alt="Nexus logo"
                                        width={28}
                                        height={28}
                                        className="object-contain rounded-lg"
                                    />
                                </div>
                                <span className="font-display font-extrabold text-2xl tracking-tighter text-slate-900 dark:text-white">
                                    NEXUS
                                </span>
                            </Link>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs font-sans">
                                {t("footer.description")}
                            </p>
                        </div>

                        {/* Navigation Columns */}
                        <div className="space-y-4">
                            <h4 className="font-display font-bold text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">{t("footer.product")}</h4>
                            <ul className="space-y-2.5 text-sm text-slate-650 dark:text-slate-350 font-medium">
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-green transition-colors">{t("footer.pricing")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-green transition-colors">{t("footer.download")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-green transition-colors">{t("footer.serverList")}</Link></li>
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-display font-bold text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">{t("footer.company")}</h4>
                            <ul className="space-y-2.5 text-sm text-slate-650 dark:text-slate-350 font-medium">
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-magenta transition-colors">{t("footer.blog")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-magenta transition-colors">{t("footer.careers")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color dark:hover:text-brand-magenta transition-colors">{t("footer.aboutUs")}</Link></li>
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-display font-bold text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">{t("footer.resources")}</h4>
                            <ul className="space-y-2.5 text-sm text-slate-655 dark:text-slate-350 font-medium">
                                <li><Link href="#" className="hover:text-primary-color transition-colors">{t("footer.support")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color transition-colors">{t("footer.guidelines")}</Link></li>
                                <li><Link href="#" className="hover:text-primary-color transition-colors">{t("footer.developers")}</Link></li>
                            </ul>
                        </div>
                    </div>

                    <div className="w-full border-t border-dashed border-slate-200 dark:border-surface-indigo/35 mb-8" />

                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                        <p className="text-xs text-slate-500 order-2 md:order-1 font-medium font-sans">
                            {t("footer.copyright")}
                        </p>

                        <div className="flex items-center gap-6 order-1 md:order-2">
                            <Link
                                href="#"
                                className="text-slate-500 dark:text-slate-400 hover:text-brand-green dark:hover:text-brand-green transition-all duration-300 hover:scale-110"
                                aria-label="Twitter page"
                            >
                                <Twitter className="h-5 w-5" />
                            </Link>
                            <Link
                                href="#"
                                className="text-slate-500 dark:text-slate-400 hover:text-brand-magenta dark:hover:text-brand-magenta transition-all duration-300 hover:scale-110"
                                aria-label="Instagram profile"
                            >
                                <Instagram className="h-5 w-5" />
                            </Link>
                            <Link
                                href="#"
                                className="text-slate-500 dark:text-slate-400 hover:text-primary-color dark:hover:text-primary-color transition-all duration-300 hover:scale-110"
                                aria-label="Facebook page"
                            >
                                <Facebook className="h-5 w-5" />
                            </Link>
                            <Link
                                href="#"
                                className="text-slate-500 dark:text-slate-400 hover:text-brand-green dark:hover:text-brand-green transition-all duration-300 hover:scale-110"
                                aria-label="YouTube channel"
                            >
                                <Youtube className="h-5 w-5" />
                            </Link>
                        </div>
                    </div>

                    {/* Giant Watermark Background Text */}
                    <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 select-none pointer-events-none opacity-[0.02] dark:opacity-[0.03] text-center w-full shrink-0 z-0">
                        <span className="text-7xl md:text-9xl lg:text-[180px] font-display font-black tracking-tighter uppercase leading-none block text-slate-900 dark:text-white">
                            NEXUS
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
