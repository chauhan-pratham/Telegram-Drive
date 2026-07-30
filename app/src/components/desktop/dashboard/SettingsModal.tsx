import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { X, RotateCcw, Download, Trash2, HardDrive, Globe, Key, Check, RefreshCw, FolderArchive, Shield, Sparkles, Clipboard, Loader2, Palette, Plus, Tag, SlidersHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useSettings } from '../../../context/SettingsContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { DetailedCacheInfo } from '../../../types';
import { version as appVersion } from '../../../../package.json';
import { useTheme } from '../../../context/ThemeContext';
import { CustomTheme, ThemeColorPalette, generateThemeId } from '../../../theme/themeEngine';
import { getDefaultPalette } from '../../../theme/presets';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsTab = 'themes' | 'proxy' | 'cache' | 'behavior' | 'privacy' | 'updates';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { settings, updateSetting, resetSettings } = useSettings();
    const { confirm } = useConfirm();
    const [clearing, setClearing] = useState(false);

    // Transcode cache state
    const [_transcodeCache, setTranscodeCache] = useState<DetailedCacheInfo | null>(null);
    const [_cacheLoading, setCacheLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>('themes');
    const [proxyStatus, setProxyStatus] = useState<{ reachable: boolean; latency_ms: number } | null>(null);

    // Update check state
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
    const [updateVersion, setUpdateVersion] = useState<string | null>(null);
    const [updateDownloading, setUpdateDownloading] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(0);

    // Diagnostics state
    const [diagLoading, setDiagLoading] = useState(false);

    const handleCheckForUpdates = useCallback(async () => {
        setUpdateChecking(true);
        try {
            const updateInfo = await check();
            if (updateInfo) {
                setUpdateAvailable(updateInfo);
                setUpdateVersion(updateInfo.version);
                toast.success(`Update available: v${updateInfo.version}`);
            } else {
                setUpdateAvailable(null);
                setUpdateVersion(null);
                toast.success('You are using the latest version.');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('dev') || msg.includes('no current version')) {
                toast.info('Auto-update is available in production builds.');
            } else {
                toast.error(`Update check failed: ${msg}`);
            }
        } finally {
            setUpdateChecking(false);
        }
    }, []);

    const handleInstallUpdate = useCallback(async () => {
        if (!updateAvailable) return;
        setUpdateDownloading(true);
        setUpdateProgress(0);
        let downloaded = 0;
        let contentLength = 0;
        try {
            await updateAvailable.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                    const data = event.data as { contentLength?: number };
                    contentLength = data.contentLength || 0;
                } else if (event.event === 'Progress') {
                    const data = event.data as { chunkLength?: number };
                    downloaded += data.chunkLength || 0;
                    if (contentLength > 0) {
                        setUpdateProgress(Math.min(Math.round((downloaded / contentLength) * 100), 100));
                    }
                }
            });
            await relaunch();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Update failed: ${msg}`);
            setUpdateDownloading(false);
        }
    }, [updateAvailable]);


    // Fetch transcode cache info
    const fetchTranscodeCache = useCallback(async () => {
        setCacheLoading(true);
        try {
            const info = await invoke<DetailedCacheInfo>('cmd_get_detailed_transcode_cache');
            setTranscodeCache(info);
        } catch {
            setTranscodeCache(null);
        } finally {
            setCacheLoading(false);
        }
    }, []);

    // Load transcode cache when on cache tab
    useEffect(() => {
        if (isOpen && (activeTab as string) === 'general') {
            fetchTranscodeCache();
        }
    }, [isOpen, activeTab, fetchTranscodeCache]);

    // Sync proxy settings to backend whenever they change
    useEffect(() => {
        const applyProxy = async () => {
            try {
                await invoke('cmd_apply_proxy_settings', {
                    enabled: settings.proxyEnabled,
                    proxyType: settings.proxyType,
                    host: settings.proxyHost,
                    port: settings.proxyPort,
                    username: settings.proxyUsername,
                    password: settings.proxyPassword,
                });
            } catch {
                // best-effort sync
            }
        };
        applyProxy();
    }, [
        settings.proxyEnabled, settings.proxyType, settings.proxyHost,
        settings.proxyPort, settings.proxyUsername, settings.proxyPassword,
    ]);

    // Sync VPN optimizer settings to backend whenever they change
    useEffect(() => {
        const applyVpn = async () => {
            try {
                await invoke('cmd_apply_vpn_settings', {
                    enabled: settings.vpnMode,
                    timeoutMultiplier: settings.timeoutMultiplier,
                    retryAttempts: settings.retryAttempts,
                    retryBaseBackoffMs: Math.round(settings.retryBaseBackoffSec * 1000),
                    retryMaxBackoffMs: Math.round(settings.retryMaxBackoffSec * 1000),
                    adaptivePolling: settings.adaptivePolling,
                    pollingMinSec: settings.pollingMinSec,
                    pollingMaxSec: settings.pollingMaxSec,
                    preferredDc: settings.preferredDC,
                    dcFallbackAttempts: settings.dcFallbackAttempts,
                    floodWaitRespect: settings.floodWaitRespect,
                    peerCacheSize: settings.peerCacheSize,
                    bandwidthLimitUpKbs: settings.bandwidthLimitUpKBs,
                    bandwidthLimitDownKbs: settings.bandwidthLimitDownKBs,
                    chunkSizeKb: settings.chunkSizeKb,
                    keepAliveIntervalSec: settings.keepAliveIntervalSec,
                    autoDetectVpn: settings.autoDetectVpn,
                    archiveMaxBytes: settings.archiveMaxBytes * 1024 * 1024,
                });
            } catch {
                // best-effort sync
            }
        };
        applyVpn();
    }, [
        settings.vpnMode, settings.timeoutMultiplier, settings.retryAttempts,
        settings.retryBaseBackoffSec, settings.retryMaxBackoffSec, settings.adaptivePolling,
        settings.pollingMinSec, settings.pollingMaxSec, settings.preferredDC,
        settings.dcFallbackAttempts, settings.floodWaitRespect, settings.peerCacheSize,
        settings.bandwidthLimitUpKBs, settings.bandwidthLimitDownKBs, settings.chunkSizeKb,
        settings.keepAliveIntervalSec, settings.autoDetectVpn, settings.archiveMaxBytes,
    ]);

    // Poll proxy status when General tab is active
    useEffect(() => {
        if (!isOpen || (activeTab as string) !== 'general') return;
        const checkProxy = async () => {
            if (!settings.proxyEnabled || !settings.proxyLiveStateEnabled) {
                setProxyStatus(null);
                return;
            }
            try {
                const status = await invoke<{ reachable: boolean; latency_ms: number }>('cmd_get_proxy_status');
                setProxyStatus(status);
            } catch {
                setProxyStatus({ reachable: false, latency_ms: -1 });
            }
        };
        checkProxy();
        const interval = setInterval(checkProxy, 5000);
        return () => clearInterval(interval);
    }, [isOpen, activeTab, settings.proxyEnabled, settings.proxyLiveStateEnabled]);



    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={onClose}
                >
                    <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                        className="bg-telegram-surface border border-telegram-border/60 rounded-2xl w-full max-w-4xl h-[620px] max-h-[90vh] shadow-2xl overflow-hidden flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header Bar */}
                        <div className="px-6 py-4 border-b border-telegram-border flex justify-between items-center bg-telegram-surface">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-telegram-primary/10 text-telegram-primary">
                                    <SlidersHorizontal className="w-5 h-5 stroke-[2]" />
                                </div>
                                <div>
                                    <h2 className="text-telegram-text font-bold text-base tracking-tight">Settings</h2>
                                    <p className="text-xs text-telegram-subtext">Manage appearance, network proxies, storage, and app preferences</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-telegram-hover rounded-xl text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 2-Column Body Content */}
                        <div className="flex flex-1 min-h-0 overflow-hidden">
                            {/* Left Navigation Sidebar */}
                            <div className="w-60 border-r border-telegram-border/50 bg-telegram-hover/10 p-3 space-y-1 overflow-y-auto shrink-0 select-none">
                                {[
                                    { id: 'themes', label: 'Appearance & Themes', icon: Palette },
                                    { id: 'proxy', label: 'Proxy & Connection', icon: Shield },
                                    { id: 'cache', label: 'Storage & Cache', icon: HardDrive },
                                    { id: 'behavior', label: 'Behavior & UI', icon: SlidersHorizontal },
                                    { id: 'privacy', label: 'Privacy & Security', icon: Key },
                                    { id: 'updates', label: 'Updates & About', icon: Sparkles },
                                ].map((sec) => {
                                    const Icon = sec.icon;
                                    const isActive = activeTab === sec.id;
                                    return (
                                        <button
                                            key={sec.id}
                                            onClick={() => setActiveTab(sec.id as SettingsTab)}
                                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                                                isActive
                                                    ? 'bg-telegram-primary text-black font-bold shadow-md shadow-telegram-primary/20'
                                                    : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover/40 font-medium'
                                            }`}
                                        >
                                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-black' : 'text-telegram-subtext'}`} />
                                            <span className="text-xs truncate">{sec.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Right Settings Content Panel */}
                            <div className="flex-1 p-6 overflow-y-auto bg-telegram-surface relative custom-scrollbar">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {activeTab === 'themes' && (
                                        <motion.div
                                            key="themes"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-6"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Appearance & Custom Themes</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Customize your desktop interface look, colors, and theme presets.</p>
                                            </div>

                                            <div className="p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                <ThemesTab />
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'proxy' && (
                                        <motion.div
                                            key="proxy"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-5"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Proxy & Network Configuration</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Configure network proxies for bypass or restricted network environments.</p>
                                            </div>

                                            <div className="space-y-3">
                                                {/* Enable Proxy */}
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-3 h-3 rounded-full ${
                                                            !settings.proxyEnabled || !settings.proxyLiveStateEnabled
                                                                ? 'bg-gray-500' 
                                                                : !proxyStatus 
                                                                    ? 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.5)]' 
                                                                    : proxyStatus.reachable 
                                                                        ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' 
                                                                        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                                                        }`} />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs font-bold text-telegram-text">Enable Network Proxy</p>
                                                                {settings.proxyEnabled && (
                                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-telegram-primary/10 text-telegram-primary font-mono font-bold">
                                                                        {!settings.proxyLiveStateEnabled
                                                                            ? 'Off'
                                                                            : !proxyStatus 
                                                                                ? 'Checking…' 
                                                                                : proxyStatus.reachable 
                                                                                    ? `Connected (${proxyStatus.latency_ms}ms)` 
                                                                                    : 'Unreachable'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">Route app network traffic through SOCKS5 or HTTP/HTTPS proxy</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => updateSetting('proxyEnabled', !settings.proxyEnabled)}
                                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.proxyEnabled ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.proxyEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>

                                                {/* Live Connection Monitoring */}
                                                {settings.proxyEnabled && (
                                                    <div className="flex items-center justify-between p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                        <div>
                                                            <p className="text-xs font-bold text-telegram-text">Live Connection Monitoring</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">Periodically check connectivity and display latency</p>
                                                        </div>
                                                        <button
                                                            onClick={() => updateSetting('proxyLiveStateEnabled', !settings.proxyLiveStateEnabled)}
                                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.proxyLiveStateEnabled ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                                        >
                                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.proxyLiveStateEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Proxy Type & Host/Port Grid */}
                                                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                    <div>
                                                        <label className="text-xs font-bold text-telegram-text block mb-1">Proxy Protocol</label>
                                                        <select
                                                            value={settings.proxyType}
                                                            onChange={e => updateSetting('proxyType', e.target.value as 'socks5' | 'http' | 'https')}
                                                            className="w-full bg-telegram-bg border border-telegram-border/60 rounded-xl px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary transition"
                                                        >
                                                            <option value="socks5">SOCKS5 Proxy</option>
                                                            <option value="http">HTTP Proxy</option>
                                                            <option value="https">HTTPS Proxy</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="text-xs font-bold text-telegram-text block mb-1">Host Server</label>
                                                        <input
                                                            type="text"
                                                            placeholder="127.0.0.1"
                                                            value={settings.proxyHost}
                                                            onChange={e => updateSetting('proxyHost', e.target.value)}
                                                            className="w-full bg-telegram-bg border border-telegram-border/60 rounded-xl px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary transition"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-xs font-bold text-telegram-text block mb-1">Port</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="65535"
                                                            value={settings.proxyPort}
                                                            onChange={e => updateSetting('proxyPort', Math.max(1, Math.min(65535, parseInt(e.target.value) || 1080)))}
                                                            className="w-full bg-telegram-bg border border-telegram-border/60 rounded-xl px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary transition"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-xs font-bold text-telegram-text block mb-1">Username</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Optional"
                                                            value={settings.proxyUsername}
                                                            onChange={e => updateSetting('proxyUsername', e.target.value)}
                                                            className="w-full bg-telegram-bg border border-telegram-border/60 rounded-xl px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary transition"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'cache' && (
                                        <motion.div
                                            key="cache"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-5"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Storage & Cache Management</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Manage local disk space, clear cached media thumbnails, and video transcode data.</p>
                                            </div>

                                            <div className="p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-telegram-text">Clear Temporary Application Cache</h4>
                                                        <p className="text-[11px] text-telegram-subtext mt-0.5">Removes temporary thumbnails and downloaded preview files.</p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            const ok = await confirm({
                                                                title: 'Clear Cache?',
                                                                message: 'Are you sure you want to clear temporary cache files?',
                                                                confirmText: 'Clear Cache',
                                                                variant: 'danger',
                                                            });
                                                            if (!ok) return;
                                                            setClearing(true);
                                                            try {
                                                                await invoke('cmd_clear_cache');
                                                                toast.success('Cache cleared successfully!');
                                                            } catch (e) {
                                                                toast.error(`Failed to clear cache: ${e}`);
                                                            } finally {
                                                                setClearing(false);
                                                            }
                                                        }}
                                                        disabled={clearing}
                                                        className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        {clearing ? 'Clearing…' : 'Clear Cache'}
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'behavior' && (
                                        <motion.div
                                            key="behavior"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-5"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Behavior & UI Preferences</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Configure general application preferences and upload behavior.</p>
                                            </div>

                                            <div className="space-y-3">
                                                {/* Zip Before Upload */}
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                    <div className="flex items-center gap-3">
                                                        <FolderArchive className="w-5 h-5 text-telegram-primary shrink-0" />
                                                        <div>
                                                            <p className="text-xs font-bold text-telegram-text">ZIP Folders Before Upload</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">Automatically compress folder structures into a single .zip archive before uploading</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => updateSetting('zipFolders', !settings.zipFolders)}
                                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.zipFolders ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.zipFolders ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>

                                                {/* Hide Groups */}
                                                <div className="flex items-center justify-between p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40">
                                                    <div className="flex items-center gap-3">
                                                        <Tag className="w-5 h-5 text-telegram-primary shrink-0" />
                                                        <div>
                                                            <p className="text-xs font-bold text-telegram-text">Hide Folder Groups</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">Hide sidebar group categories for a cleaner single-list view</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => updateSetting('hideGroups', !settings.hideGroups)}
                                                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${settings.hideGroups ? 'bg-telegram-primary' : 'bg-telegram-border'}`}
                                                    >
                                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${settings.hideGroups ? 'translate-x-5' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'privacy' && (
                                        <motion.div
                                            key="privacy"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-5"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Privacy & Security Guidelines</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Recommendations for maintaining end-to-end security over your cloud storage.</p>
                                            </div>

                                            <div className="p-4 rounded-xl bg-telegram-primary/10 border border-telegram-primary/20 text-telegram-text space-y-2">
                                                <div className="flex items-center gap-2 text-telegram-primary font-bold text-xs">
                                                    <Shield className="w-4 h-4" />
                                                    <span>Client-Side File Privacy Recommendation</span>
                                                </div>
                                                <p className="text-xs text-telegram-subtext leading-relaxed">
                                                    For absolute privacy on Telegram servers, you can upload password-protected archives (.zip, .7z) or pre-encrypted files. Telegram Drive preserves file binary integrity byte-for-byte.
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}

                                    {activeTab === 'updates' && (
                                        <motion.div
                                            key="updates"
                                            initial={{ opacity: 0, x: 12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -12 }}
                                            transition={{ duration: 0.15 }}
                                            className="space-y-5"
                                        >
                                            <div>
                                                <h3 className="text-base font-bold text-telegram-text">Updates & Application Info</h3>
                                                <p className="text-xs text-telegram-subtext mt-0.5">Check for software updates and view app diagnostic build details.</p>
                                            </div>

                                            <div className="p-4 rounded-xl bg-telegram-hover/20 border border-telegram-border/40 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Download className="w-5 h-5 text-telegram-primary shrink-0" />
                                                        <div>
                                                            <p className="text-xs font-bold text-telegram-text">Check for Updates</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                                {updateVersion ? `New update v${updateVersion} is available` : 'Keep Telegram Drive updated to the latest build'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {updateAvailable && !updateDownloading ? (
                                                        <button
                                                            onClick={handleInstallUpdate}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-telegram-primary text-black hover:bg-telegram-primary/90 transition shadow-md"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                            Restart & Update
                                                        </button>
                                                    ) : updateDownloading ? (
                                                        <div className="flex items-center gap-2">
                                                            <RefreshCw className="w-4 h-4 text-telegram-primary animate-spin" />
                                                            <span className="text-xs text-telegram-primary font-mono font-bold">{updateProgress}%</span>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={handleCheckForUpdates}
                                                            disabled={updateChecking}
                                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-telegram-primary/10 text-telegram-primary hover:bg-telegram-primary/20 border border-telegram-primary/20 transition disabled:opacity-50 cursor-pointer"
                                                        >
                                                            <RefreshCw className={`w-3.5 h-3.5 ${updateChecking ? 'animate-spin' : ''}`} />
                                                            {updateChecking ? 'Checking…' : 'Check Now'}
                                                        </button>
                                                    )}
                                                </div>

                                                {updateDownloading && (
                                                    <div className="w-full h-2 bg-telegram-border rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-telegram-primary rounded-full transition-all duration-300"
                                                            style={{ width: `${updateProgress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* About App Box */}
                                            <div className="p-5 rounded-xl bg-telegram-hover/10 border border-telegram-border/30 flex flex-col items-center text-center space-y-3">
                                                <div>
                                                    <h4 className="text-sm font-bold text-telegram-text">Telegram Drive</h4>
                                                    <p className="text-xs text-telegram-subtext mt-0.5">Version {appVersion}</p>
                                                </div>

                                                <button
                                                    onClick={async () => {
                                                        setDiagLoading(true);
                                                        try {
                                                            const info = await invoke<string>('cmd_get_system_diagnostics');
                                                            await navigator.clipboard.writeText(info);
                                                            toast.success('Diagnostics copied to clipboard!');
                                                        } catch (e) {
                                                            toast.error(`Failed to copy diagnostics: ${e}`);
                                                        } finally {
                                                            setDiagLoading(false);
                                                        }
                                                    }}
                                                    disabled={diagLoading}
                                                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-telegram-hover border border-telegram-border/50 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover/80 transition disabled:opacity-50 cursor-pointer"
                                                >
                                                    {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clipboard className="w-3.5 h-3.5" />}
                                                    Copy Diagnostics
                                                </button>

                                                <div className="flex justify-center gap-4 text-xs pt-1">
                                                    <button
                                                        onClick={(e) => { e.preventDefault(); open('https://github.com/chauhan-pratham'); }}
                                                        className="flex items-center gap-1.5 text-telegram-primary font-semibold hover:underline cursor-pointer"
                                                    >
                                                        <Globe className="w-3.5 h-3.5" />
                                                        Creator Profile
                                                    </button>
                                                    <span className="text-telegram-border">|</span>
                                                    <button
                                                        onClick={(e) => { e.preventDefault(); open('https://github.com/chauhan-pratham/Telegram-Drive'); }}
                                                        className="flex items-center gap-1.5 text-telegram-primary font-semibold hover:underline cursor-pointer"
                                                    >
                                                        GitHub Repository
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Footer Bar */}
                        <div className="px-6 py-3 border-t border-telegram-border flex items-center justify-between bg-telegram-surface">
                            <button
                                onClick={resetSettings}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-telegram-subtext hover:text-red-400 hover:bg-red-500/10 transition font-medium cursor-pointer"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reset to Defaults
                            </button>
                            <button
                                onClick={onClose}
                                className="px-6 py-2 rounded-xl text-xs font-bold bg-telegram-primary text-black hover:bg-telegram-primary/90 shadow-md transition cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
const PALETTE_KEYS: { key: keyof ThemeColorPalette; label: string }[] = [
    { key: 'bg', label: 'Background' },
    { key: 'surface', label: 'Surface' },
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'text', label: 'Text' },
    { key: 'subtext', label: 'Subtext' },
];

function ThemesTab() {
    const {
        customThemes,
        activeCustomThemeId,
        setActiveCustomTheme,
        addCustomTheme,
        deleteCustomTheme,
        updateCustomTheme,
    } = useTheme();
    const { confirm } = useConfirm();

    const [editingId, setEditingId] = useState<string | null>(null);

    const builtinThemes = customThemes.filter(t => t.isBuiltin);
    const userThemes = customThemes.filter(t => !t.isBuiltin);
    const editingTheme = editingId ? customThemes.find(t => t.id === editingId) : null;

    const handleCreateTheme = () => {
        const id = generateThemeId();
        const newTheme: CustomTheme = {
            id,
            name: 'My Theme',
            isDark: true,
            palette: getDefaultPalette(true),
        };
        addCustomTheme(newTheme);
        setEditingId(id);
        setActiveCustomTheme(id);
    };

    const handleSelectTheme = (theme: CustomTheme) => {
        if (activeCustomThemeId === theme.id) {
            // Deselect → reset to default
            setActiveCustomTheme(null);
            setEditingId(null);
        } else {
            setActiveCustomTheme(theme.id);
            if (!theme.isBuiltin) {
                setEditingId(theme.id);
            } else {
                setEditingId(null);
            }
        }
    };

    const handleDeleteTheme = async (id: string) => {
        const ok = await confirm({
            title: 'Delete Theme',
            message: 'Are you sure you want to delete this theme?',
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        deleteCustomTheme(id);
        if (editingId === id) setEditingId(null);
    };

    const handlePaletteChange = (key: keyof ThemeColorPalette, value: string) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        const newPalette = { ...editingTheme.palette, [key]: value };
        updateCustomTheme(editingTheme.id, { palette: newPalette });
    };

    const handleBaseToggle = (isDark: boolean) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        updateCustomTheme(editingTheme.id, { isDark });
    };

    const handleNameChange = (name: string) => {
        if (!editingTheme || editingTheme.isBuiltin) return;
        updateCustomTheme(editingTheme.id, { name });
    };

    return (
        <motion.section
            key="themes"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220, opacity: { duration: 0.15 } }}
            className="space-y-5 w-full"
        >
            {/* Presets */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                    <Palette className="w-3.5 h-3.5" />
                    Presets
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    {builtinThemes.map(theme => (
                        <button
                            key={theme.id}
                            onClick={() => handleSelectTheme(theme)}
                            className={`relative rounded-lg p-0.5 transition-all duration-200 ${
                                activeCustomThemeId === theme.id
                                    ? 'ring-2 ring-telegram-primary ring-offset-1 ring-offset-telegram-surface'
                                    : 'hover:ring-1 hover:ring-telegram-subtext/30'
                            }`}
                            title={theme.name}
                        >
                            {/* Color preview swatch */}
                            <div className="rounded-md overflow-hidden h-10 flex">
                                <div className="flex-1" style={{ background: theme.palette.bg }} />
                                <div className="flex-1" style={{ background: theme.palette.surface }} />
                                <div className="flex-1" style={{ background: theme.palette.primary }} />
                            </div>
                            <p className="text-[10px] text-telegram-subtext mt-1 truncate text-center">
                                {theme.name}
                            </p>
                            {activeCustomThemeId === theme.id && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-telegram-primary rounded-full flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom Themes */}
            <div className="space-y-2">
                <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Custom Themes
                </h3>

                {userThemes.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                        {userThemes.map(theme => (
                            <button
                                key={theme.id}
                                onClick={() => handleSelectTheme(theme)}
                                className={`relative rounded-lg p-0.5 transition-all duration-200 ${
                                    activeCustomThemeId === theme.id
                                        ? 'ring-2 ring-telegram-primary ring-offset-1 ring-offset-telegram-surface'
                                        : 'hover:ring-1 hover:ring-telegram-subtext/30'
                                }`}
                                title={theme.name}
                            >
                                <div className="rounded-md overflow-hidden h-10 flex">
                                    <div className="flex-1" style={{ background: theme.palette.bg }} />
                                    <div className="flex-1" style={{ background: theme.palette.surface }} />
                                    <div className="flex-1" style={{ background: theme.palette.primary }} />
                                </div>
                                <p className="text-[10px] text-telegram-subtext mt-1 truncate text-center">
                                    {theme.name}
                                </p>
                                {activeCustomThemeId === theme.id && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-telegram-primary rounded-full flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-white" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                <button
                    onClick={handleCreateTheme}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-telegram-border text-telegram-subtext hover:text-telegram-primary hover:border-telegram-primary/50 transition-colors text-xs"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Theme
                </button>
            </div>

            {/* Editor (shown when a custom theme is selected) */}
            {editingTheme && !editingTheme.isBuiltin && (
                <div className="space-y-3 p-3 rounded-lg bg-telegram-hover/30 border border-telegram-border/50">
                    <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">
                        Edit Theme
                    </h3>

                    {/* Theme Name */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-telegram-subtext w-16 shrink-0">Name</label>
                        <input
                            type="text"
                            value={editingTheme.name}
                            onChange={e => handleNameChange(e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded-md text-xs bg-telegram-surface border border-telegram-border text-telegram-text focus:border-telegram-primary outline-none transition"
                            maxLength={32}
                        />
                    </div>

                    {/* Base Mode Toggle */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-telegram-subtext w-16 shrink-0">Base Mode</label>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleBaseToggle(true)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                                    editingTheme.isDark
                                        ? 'bg-telegram-primary text-white'
                                        : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text'
                                }`}
                            >
                                Dark
                            </button>
                            <button
                                onClick={() => handleBaseToggle(false)}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                                    !editingTheme.isDark
                                        ? 'bg-telegram-primary text-white'
                                        : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text'
                                }`}
                            >
                                Light
                            </button>
                        </div>
                    </div>

                    {/* Color Pickers */}
                    <div className="space-y-2">
                        {PALETTE_KEYS.map(({ key, label }) => (
                            <div key={key} className="flex items-center gap-2">
                                <label className="text-xs text-telegram-subtext w-16 shrink-0">{label}</label>
                                <div className="flex items-center gap-1.5 flex-1">
                                    <input
                                        type="color"
                                        value={editingTheme.palette[key].startsWith('rgba') ? '#888888' : editingTheme.palette[key]}
                                        onChange={e => handlePaletteChange(key, e.target.value)}
                                        className="w-7 h-7 rounded-md border border-telegram-border cursor-pointer p-0.5 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={editingTheme.palette[key]}
                                        onChange={e => handlePaletteChange(key, e.target.value)}
                                        className="flex-1 px-2 py-1 rounded-md text-xs bg-telegram-surface border border-telegram-border text-telegram-text focus:border-telegram-primary outline-none transition font-mono"
                                        maxLength={30}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Delete Button */}
                    <button
                        onClick={() => handleDeleteTheme(editingTheme.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Theme
                    </button>
                </div>
            )}

            {/* Reset to Default */}
            {activeCustomThemeId && (
                <button
                    onClick={() => {
                        setActiveCustomTheme(null);
                        setEditingId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telegram-subtext hover:text-telegram-text bg-telegram-hover/50 hover:bg-telegram-hover transition"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Default
                </button>
            )}
        </motion.section>
    );
}
