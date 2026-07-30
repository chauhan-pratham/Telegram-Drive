import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Key, Lock, ArrowRight, Settings, ShieldCheck, HelpCircle, ExternalLink, X, QrCode } from "lucide-react";
import { load } from '@tauri-apps/plugin-store';
import { open } from '@tauri-apps/plugin-shell';
import { QRCodeSVG } from 'qrcode.react';

type Step = "setup" | "phone" | "code" | "password";

export function AuthWizard({ onLogin }: { onLogin: () => void }) {
    const isBrowser = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

    if (isBrowser) {
        return (
            <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto p-8 text-center">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                    <ShieldCheck className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-4">Desktop App Required</h1>
                <p className="text-gray-400 mb-6 leading-relaxed">
                    You are viewing the internal development server in a browser.
                    This application cannot function here because it requires access to the system backend (Rust).
                </p>
                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700 text-sm text-gray-300">
                    Please open the <strong>Telegram Drive</strong> window in your OS taskbar/dock to continue.
                </div>
            </div>
        );
    }

    const [step, setStep] = useState<Step>("setup");
    const [loading, setLoading] = useState(false);

    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");

    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [floodWait, setFloodWait] = useState<number | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [loginMethod, setLoginMethod] = useState<'phone' | 'qr'>('phone');
    const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase());

    useEffect(() => {
        if (isMobile && loginMethod !== 'phone') {
            setLoginMethod('phone');
        }
    }, [isMobile, loginMethod]);

    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [qrPolling, setQrPolling] = useState(false);
    const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!floodWait) return;
        const interval = setInterval(() => {
            setFloodWait(prev => {
                if (prev === null || prev <= 1) return null;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [floodWait]);

    useEffect(() => {
        const initStore = async () => {
            try {
                const store = await load('config.json');
                const savedId = await store.get<string>('api_id');
                const savedHash = await store.get<string>('api_hash');

                if (savedId) setApiId(String(savedId));
                if (savedHash) setApiHash(String(savedHash));
            } catch (err) {
                console.warn('Failed to load credentials from store:', err);
            }
        };
        initStore();
    }, []);

    const saveCredentials = async () => {
        try {
            const store = await load('config.json');
            await store.set('api_id', apiId.trim());
            await store.set('api_hash', apiHash.trim());
            await store.save();
        } catch (err) {
            console.error('Failed to save credentials to store:', err);
        }
    };

    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (apiId.includes(' ') || apiHash.includes(' ')) {
            setError("API ID and API Hash cannot contain spaces. Please remove any spaces.");
            return;
        }

        if (!apiId.trim() || !apiHash.trim()) {
            setError("Please fill in both API ID and API Hash.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await saveCredentials();
            const parsedApiId = parseInt(apiId, 10);
            if (isNaN(parsedApiId)) {
                setError("API ID must be a number.");
                setLoading(false);
                return;
            }
            const ok = await invoke<boolean>("cmd_connect", {
                apiId: parsedApiId,
            });

            if (ok) {
                setStep("phone");
            } else {
                setError("Failed to connect to Telegram. Check your API ID and try again.");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = phone.replace(/\s+/g, '');
        if (!trimmed) {
            setError("Please enter your phone number.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await invoke<string>("cmd_auth_request_code", {
                phone: trimmed,
                apiId: parseInt(apiId, 10),
                apiHash,
            });
            if (result === "code_sent") {
                setStep("code");
            } else {
                setError("Failed to send verification code.");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const match = msg.match(/flood wait/i);
            if (match) {
                const secondsMatch = msg.match(/(\d+)/);
                if (secondsMatch) {
                    setFloodWait(parseInt(secondsMatch[1], 10));
                }
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const stopQrPolling = () => {
        if (qrPollRef.current) {
            clearInterval(qrPollRef.current);
            qrPollRef.current = null;
        }
        setQrPolling(false);
    };

    useEffect(() => {
        return () => { stopQrPolling(); };
    }, []);

    const startQrPolling = () => {
        stopQrPolling();
        setQrPolling(true);
        qrPollRef.current = setInterval(async () => {
            try {
                const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_qr_poll");
                if (res.success && res.next_step === 'dashboard') {
                    stopQrPolling();
                    onLogin();
                } else if (res.next_step === 'password_needed') {
                    stopQrPolling();
                    setStep("password");
                }
                // next_step === 'waiting' → keep polling
            } catch {
                // Poll attempt error — keep trying
            }
        }, 2000);
    };

    const handleQrLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const url = await invoke<string>("cmd_auth_qr_login", {
                apiId: parseInt(apiId, 10),
                apiHash,
            });
            if (url === "__authorized__") {
                onLogin();
            } else {
                setQrUrl(url);
                startQrPolling();
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedCode = code.replace(/\s+/g, '');
        if (!trimmedCode) {
            setError("Please enter the verification code.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_sign_in", { code: trimmedCode });
            if (res.success) {
                onLogin();
            } else if (res.next_step === 'password') {
                setStep("password");
            } else {
                setError("Sign in failed.");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.toLowerCase().includes("password")) {
                setStep("password");
                setError("Two-Factor Authentication is enabled. Please enter your cloud password.");
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            setError("Please enter your cloud password.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_check_password", { password });
            if (res.success) {
                onLogin();
            } else {
                setError("Password verification failed.");
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-telegram-bg flex items-center justify-center p-6 pt-[calc(1.5rem+env(safe-area-inset-top,24px))] relative select-none">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="auth-glass p-8 rounded-3xl shadow-2xl w-full max-w-md"
            >
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mb-4 mx-auto flex items-center justify-center filter drop-shadow-lg">
                        <img src="/logo.svg?v=2" alt="Logo" className="w-full h-full" />
                    </div>
                    <h1 className="text-2xl font-bold text-telegram-text mb-1 tracking-tight">Telegram Drive</h1>
                    <p className="text-sm text-telegram-subtext font-medium">Self-Hosted Secure Cloud Storage</p>
                </div>

                <AnimatePresence mode="wait">
                    {floodWait ? (
                        <motion.div
                            key="flood"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center space-y-6"
                        >
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                                <span className="text-2xl">⏳</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-telegram-text mb-2">Too Many Requests</h2>
                                <p className="text-sm text-telegram-subtext">Telegram has temporarily limited your actions.</p>
                                <p className="text-sm text-telegram-subtext">Please wait before trying again.</p>
                            </div>

                            <div className="text-5xl font-mono items-center justify-center flex text-telegram-primary font-bold">
                                {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, '0')}
                            </div>

                            <p className="text-xs text-red-400/60 mt-4">
                                Do not restart the app. The timer will reset if you do.
                            </p>
                        </motion.div>
                    ) : (
                        <>
                            {step === "setup" && (
                                <motion.form
                                    key="setup"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleSetupSubmit}
                                    className="space-y-5"
                                >
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider mb-2">API ID</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon text-telegram-subtext/60" />
                                                <input
                                                    type="text"
                                                    value={apiId}
                                                    onChange={(e) => setApiId(e.target.value)}
                                                    placeholder="12345678"
                                                    className="w-full glass-input rounded-xl pl-12 pr-4 py-3.5 text-telegram-text placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider mb-2">API Hash</label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon text-telegram-subtext/60" />
                                                <input
                                                    type="text"
                                                    value={apiHash}
                                                    onChange={(e) => setApiHash(e.target.value)}
                                                    placeholder="abcdef123456..."
                                                    className="w-full glass-input rounded-xl pl-12 pr-4 py-3.5 text-telegram-text placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary transition-all font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-telegram-text text-telegram-bg hover:opacity-90 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-50"
                                    >
                                        {loading ? "Connecting..." : <>Configure <Settings className="w-4 h-4" /></>}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setShowHelp(true)}
                                        className="w-full text-xs text-telegram-primary/80 hover:text-telegram-text transition-colors flex items-center justify-center gap-1.5 py-1 cursor-pointer"
                                    >
                                        <HelpCircle className="w-3.5 h-3.5" />
                                        How do I get my API credentials?
                                    </button>
                                </motion.form>
                            )}

                            {step === "phone" && (
                                <motion.div
                                    key="phone"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    className="space-y-6"
                                >
                                    {!isMobile && (
                                        <div className="flex rounded-xl overflow-hidden border border-white/10 p-0.5 bg-white/5">
                                            <button
                                                type="button"
                                                onClick={() => { setLoginMethod('phone'); setQrUrl(null); setQrPolling(false); setError(null); }}
                                                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                                    loginMethod === 'phone'
                                                        ? 'bg-white/20 text-white shadow-sm'
                                                        : 'text-white/50 hover:text-white/70'
                                                }`}
                                            >
                                                <Phone className="w-3.5 h-3.5" /> Phone Number
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setLoginMethod('qr'); setError(null); handleQrLogin(); }}
                                                className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                                    loginMethod === 'qr'
                                                        ? 'bg-white/20 text-white shadow-sm'
                                                        : 'text-white/50 hover:text-white/70'
                                                }`}
                                            >
                                                <QrCode className="w-3.5 h-3.5" /> QR Code
                                            </button>
                                        </div>
                                    )}

                                    {loginMethod === 'phone' ? (
                                        <form onSubmit={handlePhoneSubmit} className="space-y-6">
                                            <div className="space-y-2">
                                                <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Phone Number</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon text-telegram-subtext/60" />
                                                    <input
                                                        type="tel"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        placeholder="+1 234 567 8900"
                                                        className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-telegram-text placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary transition-all text-lg tracking-wide"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="w-full bg-telegram-text text-telegram-bg hover:opacity-90 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                                >
                                                    {loading ? "Connecting..." : <>Continue <ArrowRight className="w-5 h-5" /></>}
                                                </button>
                                                <button type="button" onClick={() => setStep("setup")} className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors py-2 cursor-pointer">
                                                    Back to Configuration
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex flex-col items-center gap-5">
                                            {loading && !qrUrl && (
                                                <div className="w-52 h-52 rounded-2xl bg-white/5 flex items-center justify-center">
                                                    <div className="w-8 h-8 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            {qrUrl && (
                                                <>
                                                    <div className="p-4 bg-white rounded-2xl shadow-xl">
                                                        <QRCodeSVG
                                                            value={qrUrl}
                                                            size={200}
                                                            level="M"
                                                            bgColor="#ffffff"
                                                            fgColor="#000000"
                                                        />
                                                    </div>
                                                    <div className="text-center space-y-1">
                                                        <p className="text-sm text-telegram-text/80 font-medium">Scan with your Telegram app</p>
                                                        <p className="text-xs text-telegram-subtext">Settings &gt; Devices &gt; Link Desktop Device</p>
                                                    </div>
                                                    {qrPolling && (
                                                        <div className="flex items-center gap-2 text-xs text-telegram-primary/80">
                                                            <div className="w-3 h-3 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin" />
                                                            Waiting for scan...
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handleQrLogin}
                                                        className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors cursor-pointer"
                                                    >
                                                        Refresh QR Code
                                                    </button>
                                                </>
                                            )}
                                            <button type="button" onClick={() => { setStep("setup"); setQrPolling(false); }} className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors py-2 cursor-pointer">
                                                Back to Configuration
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {step === "code" && (
                                <motion.form
                                    key="code"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handleCodeSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Telegram Code</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon text-telegram-subtext/60" />
                                            <input
                                                type="text"
                                                value={code}
                                                onChange={(e) => setCode(e.target.value)}
                                                placeholder="1 2 3 4 5"
                                                className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-telegram-text placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary transition-all text-2xl tracking-[0.5em] font-mono text-center"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-telegram-text text-telegram-bg hover:opacity-90 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                        >
                                            {loading ? "Verifying..." : "Sign In"}
                                        </button>
                                        <button type="button" onClick={() => setStep("phone")} className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors py-2 cursor-pointer">
                                            Change Phone Number
                                        </button>
                                    </div>
                                </motion.form>
                            )}

                            {step === "password" && (
                                <motion.form
                                    key="password"
                                    initial={{ x: 20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -20, opacity: 0 }}
                                    onSubmit={handlePasswordSubmit}
                                    className="space-y-6"
                                >
                                    <div className="space-y-2">
                                        <div className="p-3 bg-telegram-primary/10 border border-telegram-primary/20 rounded-xl mb-4">
                                            <p className="text-xs text-telegram-primary text-center">
                                                Your account has Two-Factor Authentication enabled.
                                                Please enter your cloud password to continue.
                                            </p>
                                        </div>
                                        <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Cloud Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 auth-form-icon text-telegram-subtext/60" />
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter your password"
                                                className="w-full glass-input rounded-xl pl-12 pr-4 py-4 text-telegram-text placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary transition-all text-lg"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="submit"
                                            disabled={loading || !password}
                                            className="w-full bg-telegram-text text-telegram-bg hover:opacity-90 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                                        >
                                            {loading ? "Verifying..." : "Unlock"}
                                        </button>
                                        <button type="button" onClick={() => { setStep("code"); setPassword(""); setError(null); }} className="text-xs text-telegram-subtext hover:text-telegram-text transition-colors py-2 cursor-pointer">
                                            Back to Code Entry
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </>
                    )}
                </AnimatePresence>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-2 shrink-0" />
                        <p className="text-red-400 text-sm leading-snug">{error}</p>
                    </motion.div>
                )}
            </motion.div>

            {/* Help Dialog */}
            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setShowHelp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="glass bg-telegram-surface border border-telegram-border rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-telegram-text">Getting Started</h2>
                                <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-telegram-hover rounded-lg transition-colors cursor-pointer">
                                    <X className="w-5 h-5 text-telegram-subtext" />
                                </button>
                            </div>

                            <div className="space-y-6 text-telegram-text">
                                <div className="p-4 bg-telegram-primary/10 border border-telegram-primary/20 rounded-xl">
                                    <p className="text-sm text-telegram-subtext">
                                        <strong className="text-telegram-primary">Telegram Drive</strong> uses your Telegram account as secure cloud storage. You'll need a Telegram account and API credentials to get started.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
                                        Go to Telegram's Developer Portal
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        Visit <button type="button" onClick={(e) => { e.preventDefault(); open('https://my.telegram.org'); }} className="text-telegram-primary underline hover:text-telegram-text cursor-pointer">my.telegram.org</button> and log in with your phone number.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
                                        Create a New Application
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        Click on <strong>"API development tools"</strong> and create a new application. Use any name and description you like.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <span className="w-6 h-6 bg-telegram-primary text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
                                        Copy Your Credentials
                                    </h3>
                                    <p className="text-sm text-telegram-subtext ml-8">
                                        After creating the app, you'll see your <strong>API ID</strong> (a number) and <strong>API Hash</strong> (a string). Copy both and paste them into the fields on the previous screen.
                                    </p>
                                </div>

                                <div className="p-4 bg-telegram-hover rounded-xl border border-telegram-border">
                                    <p className="text-xs text-telegram-subtext">
                                        <strong>🔒 Privacy:</strong> Your credentials are stored locally on your device and are never sent to any third-party servers. All data goes directly between you and Telegram.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); open('https://my.telegram.org'); }}
                                    className="w-full bg-telegram-primary text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-telegram-primary/90 transition-colors cursor-pointer"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Open my.telegram.org
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-telegram-primary/20 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-telegram-secondary/10 rounded-full blur-[100px] pointer-events-none -z-10" />
        </div>
    );
}
