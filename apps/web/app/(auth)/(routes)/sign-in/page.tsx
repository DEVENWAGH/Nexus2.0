"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Wallet } from "lucide-react";
import axios from "axios";

// Custom lightweight Base58 encoder for Solana signatures
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(buffer: Uint8Array): string {
    const digits = [0];
    for (let i = 0; i < buffer.length; i++) {
        let carry = buffer[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let string = "";
    for (let k = 0; buffer[k] === 0 && k < buffer.length - 1; k++) {
        string += "1";
    }
    for (let q = digits.length - 1; q >= 0; q--) {
        string += BASE58_ALPHABET[digits[q]];
    }
    return string;
}

export default function SignInPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<string | null>(null);

    const handleMetaMaskLogin = async () => {
        setIsLoading("evm");
        try {
            const ethereum = (window as any).ethereum;
            if (typeof ethereum === "undefined") {
                toast.error("MetaMask extension not detected! Please install it first.");
                setIsLoading(null);
                return;
            }

            // 1. Request Account Connection
            const accounts = await ethereum.request({ method: "eth_requestAccounts" });
            const address = accounts[0];
            if (!address) {
                toast.error("No Ethereum account connected.");
                setIsLoading(null);
                return;
            }

            // 2. Fetch Nonce from Node API
            const nonceRes = await axios.post("/api/profile/nonce", { address });
            const { nonce } = nonceRes.data;

            // 3. Hex-encode the challenge message for MetaMask personal_sign
            const hexMsg = "0x" + Array.from(new TextEncoder().encode(nonce))
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");

            // Prompt user to sign message
            const signature = await ethereum.request({
                method: "personal_sign",
                params: [hexMsg, address],
            });

            // 4. Verify signature on backend
            const verifyRes = await axios.post("/api/profile/verify", {
                address,
                signature,
                walletType: "evm",
            });

            if (verifyRes.data.success) {
                localStorage.setItem("nexus-user-id", address);
                toast.success("Wallet authentication successful!");
                router.push("/");
                router.refresh();
            } else {
                toast.error("Authentication verification failed.");
            }
        } catch (error: any) {
            console.error("MetaMask Login Error details:", error.message || error, error);
            toast.error(error.response?.data?.error || error.message || "Failed to authenticate with MetaMask.");
        } finally {
            setIsLoading(null);
        }
    };



    const handlePhantomLogin = async () => {
        setIsLoading("solana");
        try {
            const provider = (window as any).solana;
            if (!provider || !provider.isPhantom) {
                toast.error("Phantom Wallet not detected! Please install the Phantom extension.");
                setIsLoading(null);
                return;
            }

            // 1. Request Wallet Connection
            const conn = await provider.connect();
            const address = conn.publicKey.toString();

            // 2. Fetch Nonce from Node API
            const nonceRes = await axios.post("/api/profile/nonce", { address });
            const { nonce } = nonceRes.data;

            // 3. Prompt user to sign challenge
            const encodedMessage = new TextEncoder().encode(nonce);
            const signed = await provider.signMessage(encodedMessage, "utf8");
            const signature = toBase58(signed.signature);

            // 4. Verify signature on backend
            const verifyRes = await axios.post("/api/profile/verify", {
                address,
                signature,
                walletType: "solana",
            });

            if (verifyRes.data.success) {
                localStorage.setItem("nexus-user-id", address);
                toast.success("Phantom wallet authentication successful!");
                router.push("/");
                router.refresh();
            } else {
                toast.error("Authentication verification failed.");
            }

        } catch (error: any) {
            console.error("Phantom Login Error details:", error.message || error, error);
            toast.error(error.response?.data?.error || error.message || "Failed to authenticate with Phantom.");
        } finally {
            setIsLoading(null);
        }
    };

    return (
        <div className="relative flex flex-col justify-center items-center min-h-screen bg-zinc-950 text-white overflow-hidden p-6">
            {/* Background glowing rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-violet-600/5 rounded-full blur-3xl pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-[420px] bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 p-8 rounded-2xl shadow-2xl flex flex-col gap-6 relative z-10"
            >
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                        <Wallet className="h-6 w-6" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mt-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Access Nexus Identity
                    </h1>
                    <p className="text-sm text-zinc-400 max-w-[300px]">
                        Verify ownership of your cryptographic keys using your wallet to start chatting securely.
                    </p>
                </div>

                <div className="flex flex-col gap-3.5 mt-2">
                    {/* MetaMask EVM Button */}
                    <button
                        onClick={handleMetaMaskLogin}
                        disabled={isLoading !== null}
                        className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 font-medium text-sm text-zinc-100 hover:border-orange-500/30 group cursor-pointer"
                    >
                        {isLoading === "evm" ? (
                            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                        ) : (
                            <img
                                src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
                                alt="MetaMask"
                                className="h-5 w-5 transition-transform group-hover:scale-105"
                            />
                        )}
                        <span className="flex-1 text-left">Connect MetaMask (EVM)</span>
                    </button>

                    {/* Phantom Solana Button */}
                    <button
                        onClick={handlePhantomLogin}
                        disabled={isLoading !== null}
                        className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 font-medium text-sm text-zinc-100 hover:border-purple-500/30 group cursor-pointer"
                    >
                        {isLoading === "solana" ? (
                            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                        ) : (
                            <img
                                src="https://static.vecteezy.com/system/resources/previews/024/097/116/non_2x/phantom-solana-wallet-logo-transparent-free-png.png"
                                alt="Phantom"
                                className="h-5 w-5 transition-transform group-hover:scale-105"
                                onError={(e) => {
                                    // Fallback if image fails to load
                                    (e.target as any).src = "https://cryptologos.cc/logos/solana-sol-logo.png";
                                }}
                            />
                        )}
                        <span className="flex-1 text-left">Connect Phantom (Solana)</span>
                    </button>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/10 text-xs text-indigo-400/80 mt-1 leading-normal">
                    <ShieldAlert className="h-4.5 w-4.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    <p>
                        We never store private keys or connect to the public mainnet. Signature validation is done strictly for local identity authorization.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
