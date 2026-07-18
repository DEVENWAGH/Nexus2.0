"use client";

import { useEffect, useState, useCallback } from "react";

import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "next-themes";
import {
    Activity,
    Blocks,
    Clock,
    Database,
    Flame,
    Hammer,
    Loader2,
    Lock,
    Moon,
    RefreshCw,
    Server,
    Sun,
    SunMoon,
    Terminal,
    Timer,
    Trash2,
    User,
    Wifi,
    WifiOff,
    Zap,
    Cpu,
    AlertTriangle,
    PieChart,
    LogOut,
    CheckCircle2
} from "lucide-react";
import axios from "axios";
import { format } from "date-fns";

const NODE_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlatformAnalytics {
    totalProfiles: number;
    totalServers: number;
    totalChannels: number;
    totalMessages: number;
    totalDirectMessages: number;
    totalMembers: number;
    channelStats: {
        text: number;
        audio: number;
        video: number;
    };
    selfDestructStats: {
        expiringMessages: number;
        expiringDMs: number;
    };
    blockchain: {
        connected: boolean;
        mode: string;
        note?: string;
        pendingTransactions: number;
        length?: number;
    };
    system: {
        uptime: number;
        nodeVersion: string;
        platform: string;
        memory: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
        };
    };
}

interface PurgeResult {
    deletedMessages: number;
    deletedDirectMessages: number;
    prunedBlocks?: number;
    prunedTransactions?: number;
}

interface MineResult {
    success: boolean;
    message?: string;
    block?: {
        index: number;
        timestamp: string;
        hash: string;
        transactionCount: number;
    };
}

interface AuditResult {
    verified: boolean;
    totalChecked: number;
    tamperedCount: number;
    tamperedDetails: Array<{ id: string; content: string; member: string; timestamp: string }>;
}

// ── Theme Toggle ───────────────────────────────────────────────────────────────

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
                    className={`p-1.5 rounded-md transition-all ${
                        theme === key
                            ? "bg-background text-foreground shadow-sm animate-fade-in"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Icon className="w-3.5 h-3.5" />
                </button>
            ))}
        </div>
    );
}

// ── Cron Countdown Badge ───────────────────────────────────────────────────────

function CronCountdown() {
    const [msLeft, setMsLeft] = useState(0);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            const next = new Date(now);
            next.setHours(24, 0, 0, 0);
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

    return (
        <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors select-none ${
                isUrgent
                    ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                    : isWarning
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-secondary border-border text-muted-foreground"
            }`}
        >
            <Timer className={`w-3.5 h-3.5 flex-shrink-0 ${isUrgent ? "animate-pulse" : ""}`} />
            <span className="hidden sm:inline text-muted-foreground">Next Purge</span>
            <span className={`font-bold tabular-nums ${
                isUrgent ? "text-rose-500" : isWarning ? "text-amber-500" : "text-indigo-500 dark:text-indigo-400"
            }`}>
                {fmt(h)}:{fmt(m)}:{fmt(s)}
            </span>
        </div>
    );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    sub,
    color,
    loading,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number | undefined;
    sub?: string;
    color: string;
    loading?: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl bg-card border border-border p-5 flex flex-col gap-3 backdrop-blur-sm shadow-sm dark:shadow-none hover:shadow-md transition-all duration-300"
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-sm`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
                {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mt-1" />
                ) : (
                    <p className="text-3xl font-bold text-foreground mt-0.5 tracking-tight">{value ?? "—"}</p>
                )}
                {sub && <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium">{sub}</p>}
            </div>
        </motion.div>
    );
}

// ── Log Entry ─────────────────────────────────────────────────────────────────

function LogEntry({ text, type = "info" }: { text: string; type?: "info" | "success" | "error" | "warn" }) {
    const colors = {
        info: "text-muted-foreground",
        success: "text-emerald-600 dark:text-emerald-400 font-semibold",
        error: "text-rose-600 dark:text-rose-400 font-semibold",
        warn: "text-amber-600 dark:text-amber-400 font-semibold",
    };
    const ts = format(new Date(), "HH:mm:ss");
    return (
        <p className={`text-xs font-mono py-0.5 border-b border-border/30 last:border-0 ${colors[type]}`}>
            <span className="text-muted-foreground/60 mr-2">[{ts}]</span>
            {text}
        </p>
    );
}

// ── Main Page Component ────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [usernameInput, setUsernameInput] = useState("");
    const [passwordInput, setPasswordInput] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginLoading, setLoginLoading] = useState(false);

    const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);
    const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
    const [purgeLoading, setPurgeLoading] = useState(false);
    const [mineResult, setMineResult] = useState<MineResult | null>(null);
    const [mineLoading, setMineLoading] = useState(false);
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [logs, setLogs] = useState<{ text: string; type: "info" | "success" | "error" | "warn"; id: number }[]>([]);



    const addLog = useCallback((text: string, type: "info" | "success" | "error" | "warn" = "info") => {
        setLogs((prev) => [{ text, type, id: Date.now() + Math.random() }, ...prev.slice(0, 49)]);
    }, []);

    // Check sessionStorage authentication status on mount
    useEffect(() => {
        const auth = sessionStorage.getItem("admin_authenticated");
        if (auth === "true") {
            setIsAuthenticated(true);
        }
    }, []);

    const fetchAnalytics = useCallback(async () => {
        setLoadingStats(true);
        try {
            const res = await axios.get<PlatformAnalytics>(`${NODE_API}/api/admin/platform-analytics`);
            setAnalytics(res.data);
            addLog("Platform analytics metrics loaded successfully", "success");
        } catch (error) {
            console.error("Failed to fetch analytics:", error);
            addLog("Failed to fetch platform-wide analytics", "error");
        } finally {
            setLoadingStats(false);
        }
    }, [addLog]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchAnalytics();
            addLog("Admin control console initialized", "info");
            const interval = setInterval(fetchAnalytics, 15000);
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, fetchAnalytics, addLog]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError("");
        setLoginLoading(true);

        setTimeout(() => {
            if (usernameInput === "NexusAdmin" && passwordInput === "Nexa@123") {
                sessionStorage.setItem("admin_authenticated", "true");
                setIsAuthenticated(true);
                setLoginLoading(false);
            } else {
                setLoginError("Invalid administrator credentials");
                setLoginLoading(false);
            }
        }, 800);
    };

    const handleLogout = () => {
        sessionStorage.removeItem("admin_authenticated");
        setIsAuthenticated(false);
        setUsernameInput("");
        setPasswordInput("");
        setAnalytics(null);
    };

    const handlePurge = async () => {
        setPurgeLoading(true);
        setPurgeResult(null);
        addLog("Triggering manual database message purge...", "info");
        try {
            const res = await axios.post<PurgeResult>(`${NODE_API}/api/admin/purge-expired`);
            setPurgeResult(res.data);
            const totalDeleted = res.data.deletedMessages + res.data.deletedDirectMessages;
            const blockchainNote = (res.data.prunedBlocks ?? 0) > 0
                ? ` + pruned ${res.data.prunedBlocks} blocks / ${res.data.prunedTransactions} TXs from OrbitDB`
                : "";
            addLog(
                `Manual Purge Complete: Cleared ${res.data.deletedMessages} channel messages and ${res.data.deletedDirectMessages} DMs${blockchainNote}.`,
                totalDeleted > 0 ? "success" : "info"
            );
            void fetchAnalytics();
        } catch {
            addLog("Failed to trigger message purge", "error");
        } finally {
            setPurgeLoading(false);
        }
    };

    const handleMine = async () => {
        setMineLoading(true);
        setMineResult(null);
        addLog("Initiating decentralized Proof-of-Work mining on OrbitDB ledger...", "info");
        try {
            const res = await axios.post(`${NODE_API}/api/blockchain/mine`, {}, { withCredentials: true });
            const data = res.data;
            if (data.success && data.block) {
                setMineResult({
                    success: true,
                    block: {
                        index: data.block.index,
                        timestamp: new Date(data.block.timestamp).toISOString(),
                        hash: data.block.hash,
                        transactionCount: data.block.transactions.length ?? 0
                    }
                });
                addLog(`OrbitDB Block #${data.block.index} mined successfully (hash: ${data.block.hash.slice(0, 16)}...) — replicated across mesh`, "success");
                void fetchAnalytics();
            } else {
                setMineResult({ success: false, message: data.message || "No pending transactions in ledger" });
                addLog("Mining skipped: no pending transactions in OrbitDB ledger", "warn");
            }
        } catch (error: any) {
            const errMsg = error.response?.data?.error || "Mining failed";
            setMineResult({ success: false, message: errMsg });
            addLog(`Decentralized mining failed: ${errMsg}`, "error");
        } finally {
            setMineLoading(false);
        }
    };

    const handleAudit = async () => {
        setAuditLoading(true);
        setAuditResult(null);
        addLog("Initiating platform database-to-blockchain ledger integrity audit...", "info");
        try {
            const res = await axios.post<AuditResult>(`${NODE_API}/api/blockchain/audit`, {}, { withCredentials: true });
            setAuditResult(res.data);
            if (res.data.verified) {
                addLog(`Security Audit Complete: Ledger integrity verified! Checked ${res.data.totalChecked} messages.`, "success");
            } else {
                addLog(`🚨 Security Audit Failure! Detected ${res.data.tamperedCount} tampered messages in database! Admin email dispatched.`, "error");
            }
        } catch {
            addLog("Failed to request system integrity audit from API", "error");
        } finally {
            setAuditLoading(false);
        }
    };

    const formatUptime = (seconds: number | undefined) => {
        if (!seconds) return "—";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}h ${m}m ${s}s`;
    };

    // 🔒 Login Screen
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4 transition-colors duration-200 relative overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative w-full max-w-md p-8 rounded-3xl bg-card/60 border border-border/80 backdrop-blur-xl shadow-xl flex flex-col items-center select-none"
                >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
                        <Terminal className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Nexus Admin Panel</h2>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                        Authorized administration access only. Please authenticate.
                    </p>

                    <form onSubmit={handleLogin} className="w-full mt-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                                Username
                            </label>
                            <div className="relative flex items-center">
                                <User className="absolute left-3 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    required
                                    value={usernameInput}
                                    onChange={(e) => setUsernameInput(e.target.value)}
                                    placeholder="Enter admin username"
                                    className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-secondary/80 border border-border focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                                Password
                            </label>
                            <div className="relative flex items-center">
                                <Lock className="absolute left-3 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    required
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    placeholder="Enter admin password"
                                    className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-secondary/80 border border-border focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        {loginError && (
                            <motion.div
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold"
                            >
                                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                <span>{loginError}</span>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loginLoading}
                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all active:scale-[0.98] shadow-md shadow-indigo-500/10 flex items-center justify-center gap-2"
                        >
                            {loginLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Authenticating…
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>

                    <div className="mt-8 flex justify-center">
                        <ThemeToggle />
                    </div>
                </motion.div>
            </div>
        );
    }

    // 🖥️ Platform Admin Dashboard
    return (
        <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
            {/* Header */}
            <div className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-20 transition-colors duration-200">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Terminal className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-sm font-extrabold tracking-tight">Nexus Control Console</h1>
                            <p className="text-[10px] text-muted-foreground font-medium">Platform Administration • Operations Dashboard</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <CronCountdown />
                        <button
                            onClick={fetchAnalytics}
                            disabled={loadingStats}
                            className="flex items-center justify-center p-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all cursor-pointer"
                            title="Refresh statistics"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingStats ? "animate-spin" : ""}`} />
                        </button>
                        <ThemeToggle />
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 font-semibold transition-all active:scale-95 cursor-pointer"
                            title="Logout"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        icon={User}
                        label="Total Users"
                        value={analytics?.totalProfiles}
                        sub="Registered profiles"
                        color="bg-indigo-500"
                        loading={loadingStats}
                    />
                    <StatCard
                        icon={PieChart}
                        label="Communities"
                        value={analytics?.totalServers}
                        sub="Active network clusters"
                        color="bg-sky-500"
                        loading={loadingStats}
                    />
                    <StatCard
                        icon={Activity}
                        label="Active Channels"
                        value={analytics?.totalChannels}
                        sub={`${analytics?.channelStats.text || 0} Text · ${analytics?.channelStats.audio || 0} Voice · ${analytics?.channelStats.video || 0} Video`}
                        color="bg-emerald-500"
                        loading={loadingStats}
                    />
                    <StatCard
                        icon={Blocks}
                        label="Total Messages"
                        value={analytics ? analytics.totalMessages + analytics.totalDirectMessages : undefined}
                        sub={`${analytics?.totalMessages || 0} Channel · ${analytics?.totalDirectMessages || 0} DM`}
                        color="bg-purple-500"
                        loading={loadingStats}
                    />
                </div>

                {/* System Health & Watchdog Purge */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* System Performance */}
                    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 shadow-sm dark:shadow-none">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                            <Cpu className="w-4 h-4 text-indigo-500" />
                            <h2 className="text-sm font-bold tracking-tight text-foreground">System Performance</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Node API Uptime</p>
                                <p className="text-base font-bold text-foreground font-mono mt-0.5">
                                    {formatUptime(analytics?.system.uptime)}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Memory Allocation</p>
                                <p className="text-base font-bold text-foreground font-mono mt-0.5">
                                    {analytics?.system?.memory?.rss ? Math.round(analytics.system.memory.rss / (1024 * 1024)) : "—"} MB
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Process ID (OS)</p>
                                <p className="text-base font-bold text-foreground font-mono mt-0.5">
                                    {analytics ? `${analytics.system.platform} · v${analytics.system.nodeVersion}` : "—"}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Heap Usage (Active)</p>
                                <p className="text-base font-bold text-foreground font-mono mt-0.5">
                                    {analytics?.system?.memory?.heapUsed ? Math.round(analytics.system.memory.heapUsed / (1024 * 1024)) : "—"} MB
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Security Watchdog */}
                    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 shadow-sm dark:shadow-none justify-between">
                        <div className="flex items-center justify-between pb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <Flame className="w-4 h-4 text-rose-500" />
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Self-Destruct Watchdog</h2>
                            </div>
                            <div className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                24H TTL Active
                            </div>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    Pending Expiry queue:
                                </p>
                                <p className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                                    {analytics
                                        ? analytics.selfDestructStats.expiringMessages +
                                          analytics.selfDestructStats.expiringDMs
                                        : "—"}{" "}
                                    records
                                </p>
                                <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                                    Scheduled for automated midnight purge.
                                </p>
                            </div>
                            <button
                                onClick={handlePurge}
                                disabled={purgeLoading}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-rose-500/10 active:scale-95 flex-shrink-0 cursor-pointer"
                            >
                                {purgeLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                )}
                                {purgeLoading ? "Purging…" : "Run Purge"}
                            </button>
                        </div>
                        <AnimatePresence mode="wait">
                            {purgeResult && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold font-mono"
                                >
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    <span>
                                        Purged {purgeResult.deletedMessages} messages + {purgeResult.deletedDirectMessages} DMs
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Third row: Blockchain Ledger Health & Activity logs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Security Watchdog Audit */}
                    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 shadow-sm dark:shadow-none justify-between">
                        <div className="flex items-center justify-between pb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-indigo-500" />
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Watchdog Audit</h2>
                            </div>
                            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                                auditResult 
                                    ? auditResult.verified 
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                    : "bg-secondary text-muted-foreground border-border"
                            }`}>
                                {auditResult ? (
                                    auditResult.verified ? (
                                        <>Verified Secure</>
                                    ) : (
                                        <>Tampering Detected</>
                                    )
                                ) : (
                                    <>No Audit Run</>
                                )}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Database Status</p>
                            <p className={`text-xs font-bold mt-1 ${
                                auditResult 
                                    ? auditResult.verified 
                                        ? "text-emerald-500" 
                                        : "text-rose-500"
                                    : "text-muted-foreground"
                            }`}>
                                {auditResult 
                                    ? auditResult.verified 
                                        ? `Verified ${auditResult.totalChecked} messages match PoW proofs.` 
                                        : `Security Alert! ${auditResult.tamperedCount} discrepancies found.`
                                    : "Run integrity audit to cross-reference database with PoW blocks."
                                }
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2">
                            <span className="text-[10px] text-muted-foreground/80 max-w-[65%]">
                                Scans message histories against cryptographic block hashes.
                            </span>
                            <button
                                onClick={handleAudit}
                                disabled={auditLoading}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-500/10 active:scale-95 cursor-pointer flex-shrink-0"
                            >
                                {auditLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Lock className="w-3.5 h-3.5" />
                                )}
                                {auditLoading ? "Auditing…" : "Run Audit"}
                            </button>
                        </div>

                        <AnimatePresence mode="wait">
                            {auditResult && !auditResult.verified && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="p-2.5 rounded-xl text-[10px] font-mono font-semibold border bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400 max-h-[100px] overflow-y-auto"
                                >
                                    <div className="font-bold border-b border-rose-500/20 pb-1 mb-1">Mismatched Messages:</div>
                                    {auditResult.tamperedDetails.map((d, index) => (
                                        <div key={d.id} className="mt-1">
                                            [{index + 1}] ID: {d.id.slice(0, 8)}... - "{d.content.slice(0, 20)}..." by {d.member}
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Blockchain Ledger */}
                    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 shadow-sm dark:shadow-none justify-between">
                        <div className="flex items-center justify-between pb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4 text-indigo-500" />
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Ledger Integration</h2>
                            </div>
                            <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border bg-indigo-500/10 text-indigo-600 border-indigo-500/20`}>
                                <Wifi className="w-3.5 h-3.5" />
                                OrbitDB · Decentralized
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">OrbitDB Chain Height</p>
                                <p className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                                    {analytics?.blockchain.length ?? 1} blocks
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Pending Ledger TXs</p>
                                <p className="text-xl font-bold font-mono text-amber-500 mt-0.5">
                                    {analytics?.blockchain.pendingTransactions ?? 0} items
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2">
                            <span className="text-[10px] text-muted-foreground/80 max-w-[65%]">
                                PoW mining runs on replicated OrbitDB nodes — distributed, fault-tolerant, and persistent.
                            </span>
                            <button
                                onClick={handleMine}
                                disabled={mineLoading || (analytics?.blockchain.pendingTransactions ?? 0) === 0}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/10 active:scale-95 cursor-pointer"
                            >
                                {mineLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Zap className="w-3.5 h-3.5" />
                                )}
                                {mineLoading ? "Mining…" : "Mine Now"}
                            </button>
                        </div>

                        <AnimatePresence mode="wait">
                            {mineResult && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className={`p-2.5 rounded-xl text-xs font-mono font-semibold border ${
                                        mineResult.success
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                            : "bg-secondary border-border text-muted-foreground"
                                    }`}
                                >
                                    {mineResult.success
                                        ? `Block #${mineResult.block?.index} committed - ${mineResult.block?.hash.slice(0, 16)}...`
                                        : mineResult.message}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Operational Activity Log */}
                    <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4 shadow-sm dark:shadow-none justify-between h-full">
                        <div className="flex items-center justify-between pb-2 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <Server className="w-4 h-4 text-muted-foreground" />
                                <h2 className="text-sm font-bold tracking-tight text-foreground">Activity Console</h2>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">({logs.length} logged events)</span>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-40 min-h-[140px] px-1 py-1 rounded-xl bg-secondary/35 border border-border/40 space-y-1">
                            <AnimatePresence initial={false}>
                                {logs.map((log) => (
                                    <motion.div
                                        key={log.id}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <LogEntry text={log.text} type={log.type} />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {logs.length === 0 && (
                                <p className="text-xs text-muted-foreground/60 font-mono p-2">
                                    No administrative actions captured.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
