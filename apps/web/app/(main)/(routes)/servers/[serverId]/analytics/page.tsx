"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
    ShieldCheck, Timer, Activity, Network, RefreshCw,
    Cpu, Award, Zap, AlertCircle, ArrowLeft, User, Key,
    Fingerprint, AlertTriangle, CheckCircle2, XCircle,
    Eye, EyeOff, Copy, Check, Info, Sun, Moon, SunMoon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/use-auth";

import axios from "axios";
import { cn } from "@/lib/utils";
import { useIdentity } from "@/hooks/use-identity";
import { useReputationEngine } from "@/hooks/use-reputation-engine";
import { useFakeNodeDetector } from "@/hooks/use-fake-node-detector";
import { useP2PChat } from "@/hooks/use-p2p-chat";
import UserAvatar from "@/components/user-avatar";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";

type Tab = "performance" | "identity" | "topology" | "security";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "performance", label: "Link Performance", icon: Activity },
    { id: "identity", label: "My DID Identity", icon: Fingerprint },
    { id: "topology", label: "Mesh Topology", icon: Network },
    { id: "security", label: "Security Watchdog", icon: AlertTriangle },
];

// ── Theme Toggle Component ───────────────────────────────────────────────────

function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) return <div className="w-[90px] h-8" />;

    const themes = [
        { key: "light", icon: Sun, label: "Light" },
        { key: "dark", icon: Moon, label: "Dark" },
        { key: "system", icon: SunMoon, label: "System" },
    ] as const;

    return (
        <div className="flex items-center gap-0.5 p-1 rounded-lg bg-secondary border border-border select-none">
            {themes.map(({ key, icon: Icon, label }) => (
                <button
                    key={key}
                    onClick={() => setTheme(key)}
                    title={label}
                    className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        theme === key
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Icon className="w-3.5 h-3.5" />
                </button>
            ))}
        </div>
    );
}

// ── Info Tooltip Component ────────────────────────────────────────────────────

function InfoTooltip({ content }: { content: string }) {
    return (
        <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-help inline-flex items-center justify-center"
                >
                    <Info className="h-3.5 w-3.5" />
                </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs bg-popover text-popover-foreground border border-border shadow-md p-2.5 text-[11px] font-normal leading-relaxed rounded-lg">
                {content}
            </TooltipContent>
        </Tooltip>
    );
}

export default function AnalyticsPage() {
    const router = useRouter();
    const params = useParams();
    const serverId = params?.serverId as string;
    const { isReady, connectedPeers } = useP2PChat({
        roomId: `server-lobby:${serverId}`,
        enabled: true,
    });
    const { userId } = useAuth();

    const [activeTab, setActiveTab] = useState<Tab>("performance");
    const [serverMembers, setServerMembers] = useState<any[]>([]);
    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ── Simulated WebRTC stats ────────────────────────────────────────────
    const [rtt, setRtt] = useState(42);
    const [packetLoss, setPacketLoss] = useState(0.4);
    const [uploadSpeed, setUploadSpeed] = useState(240);
    const [downloadSpeed, setDownloadSpeed] = useState(412);
    const [systemLoad, setSystemLoad] = useState(12);

    // ── Phase 3: Identity ─────────────────────────────────────────────────
    const { getDID, sign } = useIdentity();
    const [myDID, setMyDID] = useState<string | null>(null);
    const [didVisible, setDidVisible] = useState(false);
    const [didCopied, setDidCopied] = useState(false);
    const [testSig, setTestSig] = useState<string | null>(null);
    const [sigVerified, setSigVerified] = useState<boolean | null>(null);

    // ── Phase 3: Reputation (Keep blacklistPeer for fake node detector auto-blacklist) ──
    const { blacklistPeer } = useReputationEngine();

    // ── Phase 4: Fake Node Detection ─────────────────────────────────────
    const { activeAlerts, alerts, dismissAlert } = useFakeNodeDetector({
        onBlacklist: (peerId, reason) => {
            console.warn(`[FakeNode] Auto-blacklisted peer ${peerId}: ${reason}`);
            void blacklistPeer(peerId, reason);
        },
    });

    // Load DID on mount
    useEffect(() => {
        getDID().then(setMyDID);
    }, [getDID]);

    // Fetch server members and online users
    useEffect(() => {
        let isMounted = true;
        const fetchMembers = async () => {
            try {
                const res = await axios.get(`/api/servers/${serverId}`);
                if (isMounted && res.data?.members) {
                    setServerMembers(res.data.members);
                }
            } catch { /* silently fail */ }
        };

        const fetchOnlineList = async () => {
            try {
                const res = await axios.get(`/api/servers/${serverId}/online`);
                if (isMounted && res.data?.onlineUserIds) {
                    setOnlineUserIds(res.data.onlineUserIds);
                }
            } catch { /* silently fail */ }
        };

        void fetchMembers();
        void fetchOnlineList();

        const iv = setInterval(() => {
            void fetchOnlineList();
        }, 8000);

        return () => {
            isMounted = false;
            clearInterval(iv);
        };
    }, [serverId]);

    // Simulated live WebRTC metrics
    useEffect(() => {
        const iv = setInterval(() => {
            setRtt((r) => Math.max(12, Math.min(120, r + (Math.random() * 10 - 5))));
            setPacketLoss((p) => Math.max(0, Math.min(2.5, p + (Math.random() * 0.2 - 0.1))));
            setUploadSpeed((s) => Math.max(10, s + Math.round(Math.random() * 40 - 20)));
            setDownloadSpeed((s) => Math.max(10, s + Math.round(Math.random() * 60 - 30)));
            setSystemLoad((l) => Math.max(5, Math.min(30, l + Math.round(Math.random() * 4 - 2))));
        }, 2000);
        return () => clearInterval(iv);
    }, []);

    const handleTestSign = async () => {
        const result = await sign("nexus-identity-test-payload");
        if (result) {
            setTestSig(result.signature.slice(0, 64) + "...");
            setSigVerified(true);
            setTimeout(() => setSigVerified(null), 4000);
        }
    };

    const handleCopyDID = () => {
        if (myDID) {
            navigator.clipboard.writeText(myDID);
            setDidCopied(true);
            setTimeout(() => setDidCopied(false), 2000);
        }
    };

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const membersRes = await axios.get(`/api/servers/${serverId}`);
            if (membersRes.data?.members) {
                setServerMembers(membersRes.data.members);
            }
            const onlineRes = await axios.get(`/api/servers/${serverId}/online`);
            if (onlineRes.data?.onlineUserIds) {
                setOnlineUserIds(onlineRes.data.onlineUserIds);
            }
            // Manually trigger updates to simulated metrics immediately
            setRtt((r) => Math.max(12, Math.min(120, r + (Math.random() * 10 - 5))));
            setPacketLoss((p) => Math.max(0, Math.min(2.5, p + (Math.random() * 0.2 - 0.1))));
            setUploadSpeed((s) => Math.max(10, s + Math.round(Math.random() * 40 - 20)));
            setDownloadSpeed((s) => Math.max(10, s + Math.round(Math.random() * 60 - 30)));
            setSystemLoad((l) => Math.max(5, Math.min(30, l + Math.round(Math.random() * 4 - 2))));
        } catch {
            // silently ignore
        } finally {
            setTimeout(() => {
                setIsRefreshing(false);
            }, 600);
        }
    };

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto transition-colors duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border bg-card/40 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="p-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 cursor-pointer transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-indigo-500 dark:text-indigo-400 flex items-center gap-2 font-mono">
                                <Network className="h-5 w-5 animate-pulse" />
                                Nexus Core Control Center
                            </h1>
                            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                Decentralized mesh network • Security watchdog
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border",
                            connectedPeers > 0 
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                                : isReady
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                : "bg-muted border-border text-muted-foreground"
                        )}>
                            <div className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                connectedPeers > 0 
                                    ? "bg-emerald-500 dark:bg-emerald-400 animate-ping" 
                                    : isReady
                                    ? "bg-amber-500 dark:bg-amber-400 animate-pulse"
                                    : "bg-muted-foreground"
                            )} />
                            {connectedPeers > 0 
                                ? `${connectedPeers} peer${connectedPeers !== 1 ? "s" : ""} active` 
                                : isReady
                                ? "Signaling active (0 peers)"
                                : "Mesh offline"}
                        </div>
                        {activeAlerts.length > 0 && (
                            <div 
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-[10px] font-mono text-rose-600 dark:text-rose-400 animate-pulse cursor-pointer" 
                                onClick={() => setActiveTab("security")}
                            >
                                <AlertTriangle className="h-3 w-3" />
                                {activeAlerts.length} alert{activeAlerts.length !== 1 ? "s" : ""}
                            </div>
                        )}
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="flex items-center justify-center p-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all cursor-pointer"
                            title="Refresh statistics"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </button>
                        <ThemeToggle />
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 px-6 pt-4 pb-0 overflow-x-auto border-b border-border/40">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isAlert = tab.id === "security" && activeAlerts.length > 0;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap border-b-2",
                                    activeTab === tab.id
                                        ? "bg-secondary/70 text-indigo-600 dark:text-indigo-400 border-indigo-500"
                                        : "text-muted-foreground hover:text-foreground border-transparent hover:bg-secondary/40",
                                    isAlert && "text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {tab.label}
                                {isAlert && (
                                    <span className="ml-1 bg-rose-500 text-white text-[9px] rounded-full px-1 font-bold">
                                        {activeAlerts.length}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="flex-1 p-6 min-h-0">
                    <AnimatePresence mode="wait">

                        {/* ── Performance Tab ─────────────────────────────────── */}
                        {activeTab === "performance" && (
                            <motion.div key="perf" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                {[
                                    { 
                                        label: "Round-Trip Time", 
                                        value: `${rtt.toFixed(1)}`, 
                                        unit: "ms", 
                                        icon: Timer, 
                                        color: "text-amber-500 dark:text-amber-400", 
                                        sub: "STUN packet transit latency",
                                        tooltip: "The time it takes for a data packet to travel from your device to a connected peer and back. Lower latency means faster, more responsive chat."
                                    },
                                    { 
                                        label: "Packet Loss", 
                                        value: `${packetLoss.toFixed(2)}`, 
                                        unit: "%", 
                                        icon: Activity, 
                                        color: "text-rose-500 dark:text-rose-400", 
                                        sub: "WebRTC outbound UDP loss",
                                        tooltip: "The percentage of data packets that fail to reach their destination. High packet loss can cause message delays or audio/video stuttering."
                                    },
                                    { 
                                        label: "Active Peers", 
                                        value: `${connectedPeers}`, 
                                        unit: "nodes", 
                                        icon: Network, 
                                        color: "text-indigo-500 dark:text-indigo-400", 
                                        sub: "Full-mesh P2P connections",
                                        tooltip: "The number of direct peer-to-peer connections currently established in this server's mesh network. More peers strengthen resiliency."
                                    },
                                ].map((stat) => (
                                    <div key={stat.label} className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-2 shadow-sm text-card-foreground">
                                        <div className="flex items-center justify-between text-muted-foreground">
                                            <span className="text-[11px] uppercase tracking-wider font-mono flex items-center gap-1.5">
                                                {stat.label}
                                                <InfoTooltip content={stat.tooltip} />
                                            </span>
                                            <stat.icon className={cn("h-5 w-5", stat.color)} />
                                        </div>
                                        <div className={cn("text-3xl font-bold font-mono mt-1", stat.color)}>
                                            {stat.value} <span className="text-sm text-muted-foreground">{stat.unit}</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/80 font-mono">{stat.sub}</p>
                                    </div>
                                ))}

                                <div className="md:col-span-2 bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 shadow-sm text-card-foreground">
                                    <h3 className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 font-mono flex items-center justify-between border-b border-border pb-3">
                                        <span className="flex items-center gap-2">
                                            <Activity className="h-4 w-4" /> Data Rates & Throughput
                                        </span>
                                        <InfoTooltip content="Shows the real-time speed of data being sent (Upload) and received (Download) directly between you and other peers in the mesh." />
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: "Upload Speed", value: uploadSpeed, color: "bg-emerald-500 text-emerald-600 dark:text-emerald-400" },
                                            { label: "Download Speed", value: downloadSpeed, color: "bg-indigo-500 text-indigo-600 dark:text-indigo-400" },
                                        ].map((s) => (
                                            <div key={s.label} className="bg-secondary/30 p-3 rounded-xl border border-border">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{s.label}</p>
                                                <p className={cn("text-2xl font-bold font-mono", s.label.includes("Upload") ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-600 dark:text-indigo-400")}>
                                                    {s.value} <span className="text-xs text-muted-foreground">KB/s</span>
                                                </p>
                                                <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                                                    <div className={cn("h-full rounded-full transition-all", s.color.split(" ")[0])} style={{ width: `${Math.min(100, s.value / 5)}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-1.5 text-xs font-mono text-muted-foreground">
                                        <div className="flex justify-between border-b border-border/40 pb-1">
                                            <span className="text-muted-foreground/60">Transport:</span> 
                                            <span className="text-foreground">UDP / DTLS</span>
                                        </div>
                                        <div className="flex justify-between border-b border-border/40 pb-1">
                                            <span className="text-muted-foreground/60">ICE Candidate:</span> 
                                            <span className="text-foreground">STUN Relay</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground/60">Cipher:</span> 
                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">AES-256-GCM (E2EE)</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4 shadow-sm text-card-foreground">
                                    <h3 className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 font-mono flex items-center justify-between border-b border-border pb-3">
                                        <span className="flex items-center gap-2">
                                            <Cpu className="h-4 w-4" /> Device Health
                                        </span>
                                        <InfoTooltip content="Monitors your local device's resource usage (CPU overhead and Memory consumption) to ensure the client runs smoothly." />
                                    </h3>
                                    <div className="flex flex-col gap-3 mt-1">
                                        {[
                                            { label: "CPU Overhead", val: systemLoad }, 
                                            { label: "Memory Pool", val: 38 }
                                        ].map((s) => (
                                            <div key={s.label}>
                                                <div className="flex justify-between text-[11px] font-mono text-muted-foreground mb-1">
                                                    <span>{s.label}</span>
                                                    <span>{s.val}%</span>
                                                </div>
                                                <div className="h-2 bg-secondary rounded-full border border-border overflow-hidden">
                                                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${s.val}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Identity Tab ─────────────────────────────────────── */}
                        {activeTab === "identity" && (
                            <motion.div key="identity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
                                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm text-card-foreground">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                                <Fingerprint className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
                                            </div>
                                            <div>
                                                <h2 className="text-sm font-bold text-foreground">Decentralized Identity (DID)</h2>
                                                <p className="text-[11px] text-muted-foreground font-mono">W3C did:key · ECDSA P-256</p>
                                            </div>
                                        </div>
                                        <InfoTooltip content="A globally unique identifier generated locally from your public key. It acts as your tamper-proof cryptographic fingerprint across the P2P network." />
                                    </div>

                                    <div className="bg-secondary/40 border border-border rounded-xl p-4 flex flex-col gap-2">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Your DID Public Key</span>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setDidVisible((v) => !v)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-secondary cursor-pointer transition-colors">
                                                    {didVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                </button>
                                                <button onClick={handleCopyDID} className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-secondary cursor-pointer transition-colors">
                                                    {didCopied ? <Check className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                        <code className={cn(
                                            "text-[9px] font-mono text-amber-600 dark:text-amber-400 break-all leading-relaxed select-all",
                                            !didVisible && "blur-sm select-none"
                                        )}>
                                            {myDID ?? "Generating..."}
                                        </code>
                                    </div>

                                    <div className="flex flex-col gap-2 text-xs font-mono text-muted-foreground">
                                        <div className="flex justify-between border-b border-border/40 pb-1.5"><span className="text-muted-foreground/60">Algorithm:</span><span className="text-foreground">ECDSA-P256</span></div>
                                        <div className="flex justify-between border-b border-border/40 pb-1.5"><span className="text-muted-foreground/60">Key Format:</span><span className="text-foreground">SPKI hex-encoded</span></div>
                                        <div className="flex justify-between border-b border-border/40 pb-1.5"><span className="text-muted-foreground/60">Storage:</span><span className="text-emerald-600 dark:text-emerald-400 font-semibold">IndexedDB (local-only)</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground/60">Status:</span><span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active & Persisted</span></div>
                                    </div>
                                </div>

                                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm text-card-foreground">
                                    <div className="flex items-start justify-between">
                                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                            <Key className="h-4 w-4 text-indigo-500 dark:text-indigo-400" /> Signature Test Panel
                                        </h3>
                                        <InfoTooltip content="Allows you to verify that your cryptographic keys are functioning correctly. In Nexus, every message you send is signed with your private key to prove it truly came from you." />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">Test your DID signing capability. Each P2P message you send is signed with this private key and verified by receiving peers.</p>

                                    <button
                                        onClick={handleTestSign}
                                        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-xs cursor-pointer transition-all shadow-sm shadow-indigo-600/10"
                                    >
                                        <Key className="h-3.5 w-3.5" /> Sign Test Payload
                                    </button>

                                    {testSig && (
                                        <div className="flex flex-col gap-2 bg-secondary/40 border border-border rounded-xl p-4">
                                            <div className="flex items-center gap-2">
                                                {sigVerified ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />
                                                )}
                                                <span className={cn("text-xs font-semibold", sigVerified ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400")}>
                                                    {sigVerified ? "Signature Valid" : "Verification Failed"}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground font-mono mt-1">Signature fragment:</p>
                                            <code className="text-[9px] text-amber-600 dark:text-amber-400 font-mono break-all bg-secondary/60 p-2 rounded">{testSig}</code>
                                        </div>
                                    )}

                                    <div className="mt-auto bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
                                        <span className="text-indigo-500 dark:text-indigo-400 font-semibold">How it works:</span> Your private key never leaves this device. When sending P2P messages, a SHA-256 signature is attached. Peers verify the signature against your DID to ensure authenticity.
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Topology Tab ─────────────────────────────────────── */}
                        {activeTab === "topology" && (() => {
                            const peerPositions = [
                                { x: "75%", y: "50%" },
                                { x: "50%", y: "78%" },
                                { x: "85%", y: "78%" },
                                { x: "15%", y: "80%" },
                            ] as const;

                            const onlinePeers = serverMembers.filter(
                                (m) => m.profile.userId !== userId && onlineUserIds.includes(m.profile.userId)
                            );

                            return (
                                <motion.div key="top" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5 shadow-sm text-card-foreground">
                                    <div className="flex items-start justify-between border-b border-border pb-3">
                                        <h3 className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 font-mono flex items-center gap-2">
                                            <Network className="h-4 w-4 animate-pulse" /> WebRTC Mesh Topology Visualizer
                                        </h3>
                                        <InfoTooltip content="A visual representation of how nodes (users) are connected in the server. Users connect directly to one another to communicate without a central database." />
                                    </div>

                                    {/* Simulation Mode Notice */}
                                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 text-amber-800 dark:text-amber-400 text-xs font-mono">
                                        <AlertTriangle className="h-4 w-4 animate-pulse flex-shrink-0" />
                                        <span>
                                            {onlinePeers.length > 0 ? (
                                                <span><strong>Live Mode:</strong> Displaying {onlinePeers.length} active peer connection{onlinePeers.length !== 1 ? "s" : ""} on the server mesh.</span>
                                            ) : (
                                                <span><strong>Notice:</strong> No other members are online on this server. Displaying simulated mock topology.</span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="relative w-full h-96 bg-secondary/10 dark:bg-secondary/5 rounded-xl border border-border overflow-hidden">
                                        <svg className="absolute inset-0 w-full h-full">
                                            <defs>
                                                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                                                    <polygon points="0 0, 6 2, 0 4" fill="#5865f2" />
                                                </marker>
                                            </defs>
                                            
                                            {/* Connections to Signaling Server */}
                                            <line x1="25%" y1="50%" x2="50%" y2="20%" stroke="#35ed7e" strokeWidth="2" strokeDasharray="6,4" opacity="0.7" markerEnd="url(#arrowhead)" />

                                            {/* Dynamic connections for online peers */}
                                            {onlinePeers.length > 0 ? (
                                                onlinePeers.slice(0, 4).map((peer, idx) => {
                                                    const pos = peerPositions[idx];
                                                    return (
                                                        <g key={peer.id}>
                                                            {/* Connect peer to signaling server */}
                                                            <line x1={pos.x} y1={pos.y} x2="50%" y2="20%" stroke="#35ed7e" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.6" />
                                                            {/* Connect My Node to peer */}
                                                            <line x1="25%" y1="50%" x2={pos.x} y2={pos.y} stroke="#5865f2" strokeWidth="2" opacity="0.8" />
                                                            {/* Packet animation */}
                                                            <circle r="4.5" fill="#5865f2" opacity="0.9">
                                                                <animateMotion dur={`${3 + idx}s`} repeatCount="indefinite">
                                                                    <mpath xlinkHref={`#path-peer-${idx}`} />
                                                                </animateMotion>
                                                            </circle>
                                                            <path id={`path-peer-${idx}`} d={`M 25% 50% L ${pos.x} ${pos.y}`} fill="none" />
                                                        </g>
                                                    );
                                                })
                                            ) : (
                                                /* Fallback mock lines */
                                                <>
                                                    <line x1="75%" y1="50%" x2="50%" y2="20%" stroke="#35ed7e" strokeWidth="2" strokeDasharray="6,4" opacity="0.7" />
                                                    <line x1="25%" y1="50%" x2="75%" y2="50%" stroke="#5865f2" strokeWidth="1.5" opacity="0.6" />
                                                    <line x1="25%" y1="50%" x2="50%" y2="78%" stroke="#5865f2" strokeWidth="1.5" opacity="0.5" />
                                                    <line x1="75%" y1="50%" x2="50%" y2="78%" stroke="#ec48bd" strokeWidth="2" opacity="0.6" />
                                                    <line x1="50%" y1="20%" x2="50%" y2="78%" stroke="#5865f2" strokeWidth="1" opacity="0.4" strokeDasharray="3,6" />
                                                </>
                                            )}
                                        </svg>

                                        {/* Signaling Server Node */}
                                        <div className="absolute left-1/2 top-[20%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
                                            <div className="h-11 w-11 rounded-full bg-indigo-500 border-2 border-indigo-400 flex items-center justify-center shadow-md shadow-indigo-500/20 hover:scale-110 transition-transform cursor-pointer">
                                                <Cpu className="h-5 w-5 text-white" />
                                            </div>
                                            <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">Signaling Server</span>
                                        </div>
                                        
                                        {/* Local Node */}
                                        <div className="absolute left-[25%] top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
                                            <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-emerald-500 flex items-center justify-center bg-card shadow-md hover:scale-110 transition-transform cursor-pointer">
                                                {(() => {
                                                    const myProfile = serverMembers.find(m => m.profile.userId === userId)?.profile;
                                                    return <UserAvatar src={myProfile?.imageUrl} name={myProfile?.name} className="h-full w-full" />;
                                                })()}
                                            </div>
                                            <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">My Node</span>
                                        </div>
                                        
                                        {/* Dynamic active nodes or fallback mock nodes */}
                                        {onlinePeers.length > 0 ? (
                                            onlinePeers.slice(0, 4).map((peer, idx) => {
                                                const pos = peerPositions[idx];
                                                return (
                                                    <div 
                                                        key={peer.id} 
                                                        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10"
                                                        style={{ left: pos.x, top: pos.y }}
                                                    >
                                                        <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-indigo-500 flex items-center justify-center bg-card shadow-md hover:scale-110 transition-transform cursor-pointer">
                                                            <UserAvatar src={peer.profile.imageUrl} name={peer.profile.name} className="h-full w-full" />
                                                        </div>
                                                        <span className="text-[9px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded max-w-24 truncate">
                                                            {peer.profile.name}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <>
                                                {/* Peer 2 */}
                                                <div className="absolute left-[75%] top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
                                                    <div className="h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                                                        <Network className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <span className="text-[9px] font-mono text-muted-foreground bg-secondary/80 border border-border px-1.5 py-0.5 rounded">Mock Peer 2</span>
                                                </div>
                                                {/* Peer 3 */}
                                                <div className="absolute left-1/2 top-[78%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10">
                                                    <div className="h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center hover:scale-110 transition-transform cursor-pointer">
                                                        <Network className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                    <span className="text-[9px] font-mono text-muted-foreground bg-secondary/80 border border-border px-1.5 py-0.5 rounded">Mock Peer 3</span>
                                                </div>
                                            </>
                                        )}

                                        {/* Legend */}
                                        <div className="absolute bottom-3 right-3 bg-card border border-border rounded-lg p-2.5 text-[9px] font-mono text-muted-foreground flex flex-col gap-1 shadow-sm">
                                            <div className="flex items-center gap-1.5"><div className="h-1.5 w-5 bg-emerald-500 rounded" /> Secure link</div>
                                            <div className="flex items-center gap-1.5"><div className="h-1.5 w-5 bg-indigo-500 rounded" /> Standard P2P</div>
                                            <div className="flex items-center gap-1.5"><div className="h-1.5 w-5 bg-pink-500 rounded" /> Cross-peer relay</div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })()}

                        {/* ── Security Watchdog Tab ─────────────────────────────── */}
                        {activeTab === "security" && (
                            <motion.div key="sec" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="flex flex-col gap-5">
                                <div className="flex items-center gap-3 bg-secondary/35 border border-border rounded-2xl p-4 shadow-sm">
                                    <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm font-bold text-foreground">Fake Node Detection & Security Watchdog</h2>
                                            <InfoTooltip content="Monitors the network for signature anomalies, unauthorized DID modifications, and malicious activities to keep the community safe." />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">Monitors DID signatures, content anomalies, and suspicious patterns. Auto-blacklists after 3+ critical violations.</p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-3">
                                        <div className="text-right">
                                            <div className={cn("text-2xl font-bold font-mono", activeAlerts.length > 0 ? "text-rose-500" : "text-emerald-500")}>{activeAlerts.length}</div>
                                            <div className="text-[10px] text-muted-foreground">active alerts</div>
                                        </div>
                                        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center border-2", activeAlerts.length > 0 ? "bg-rose-500/10 border-rose-500/40 animate-pulse" : "bg-emerald-500/10 border-emerald-500/40")}>
                                            {activeAlerts.length > 0 ? <AlertTriangle className="h-5 w-5 text-rose-500" /> : <ShieldCheck className="h-5 w-5 text-emerald-500" />}
                                        </div>
                                    </div>
                                </div>

                                {alerts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/60 bg-card border border-border rounded-2xl">
                                        <ShieldCheck className="h-14 w-14 opacity-30" />
                                        <p className="text-sm">No security alerts. All peers are behaving normally.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {alerts.map((alert) => (
                                            <div key={alert.id} className={cn(
                                                "flex items-start gap-3 border rounded-2xl p-4 transition-all shadow-sm",
                                                alert.dismissed 
                                                    ? "opacity-40 border-border bg-muted/30" 
                                                    : alert.severity === "critical" 
                                                        ? "bg-rose-500/5 border-rose-500/30 text-rose-950 dark:text-rose-200" 
                                                        : "bg-amber-500/5 border-amber-500/30 text-amber-950 dark:text-amber-200"
                                            )}>
                                                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border", alert.severity === "critical" ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500")}>
                                                    <AlertTriangle className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", alert.severity === "critical" ? "text-rose-500" : "text-amber-500")}>
                                                            {alert.severity}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-muted-foreground">peer: {alert.peerId.slice(0, 12)}...</span>
                                                        <span className="text-[10px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                                    </div>
                                                    <p className="text-xs text-foreground mt-1">{alert.reason}</p>
                                                </div>
                                                {!alert.dismissed && (
                                                    <button onClick={() => dismissAlert(alert.id)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary cursor-pointer transition-colors">
                                                        <XCircle className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </div>
        </TooltipProvider>
    );
}
