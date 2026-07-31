import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, AlertTriangle, CheckCircle2, Download, Trash2, X, Film, Music } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { TelegramFile } from '../../../types';
import { isVideoFile, isAudioFile } from '../../../utils';


interface StreamInfo {
    token: string;
    base_url: string;
}

interface MediaPlayerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
    onDownload?: (file: TelegramFile) => void;
    onShare?: (file: TelegramFile) => void;
    onDelete?: (file: TelegramFile) => void;
}

export function MediaPlayer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId, onDownload, onShare: _onShare, onDelete }: MediaPlayerProps) {

    const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
    const [isOfflineFile, setIsOfflineFile] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const mediaElementRef = useRef<HTMLVideoElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Native player fallback states
    const [downloadingNative, setDownloadingNative] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [nativePlayError, setNativePlayError] = useState<string | null>(null);

    const toggleFullscreen = useCallback(async () => {
        const nextState = !isFullscreen;
        setIsFullscreen(nextState);

        const el = containerRef.current;
        if (!el) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (el.requestFullscreen) {
                await el.requestFullscreen();
            } else if ((el as any).webkitRequestFullscreen) {
                await (el as any).webkitRequestFullscreen();
            }
        } catch {
            // Fallback to Tauri OS window fullscreen
            try {
                const win = getCurrentWindow();
                const fs = await win.isFullscreen();
                await win.setFullscreen(!fs);
            } catch {}
        }
    }, [isFullscreen]);

    useEffect(() => {
        let mounted = true;

        // Check if file binary exists in local offline storage
        invoke<string | null>('cmd_check_offline_file', {
            fileId: file.id,
            fileName: file.name,
        }).then(path => {
            if (mounted && path) {
                setIsOfflineFile(true);
            }
        }).catch(() => {});

        const timeoutId = window.setTimeout(() => {
            if (mounted) {
                setNativePlayError('The preview stream did not start in time. Try opening the file in your system player.');
            }
        }, 10_000);

        invoke<StreamInfo>('cmd_get_stream_info')
            .then((info) => {
                if (mounted) setStreamInfo(info);
            })
            .catch((error) => {
                if (mounted) setNativePlayError(`Unable to start the preview stream: ${String(error)}`);
            })
            .finally(() => window.clearTimeout(timeoutId));

        return () => {
            mounted = false;
            window.clearTimeout(timeoutId);
        };
    }, [file]);

    // Clean up temporary local cache when closed or navigated away
    useEffect(() => {
        return () => {
            invoke('cmd_clean_local_cache').catch(() => {});
        };
    }, []);

    const handleOpenNative = async () => {
        if (downloadingNative) return;
        setDownloadingNative(true);
        setDownloadProgress(0);
        setNativePlayError(null);

        const transferId = Math.random().toString(36).substring(2, 9);
        let unlisten: (() => void) | null = null;

        try {
            const fn = await listen<any>('download-progress', (event) => {
                if (event.payload.id === transferId) {
                    setDownloadProgress(event.payload.percent);
                }
            });
            unlisten = fn;


            const filePath = await invoke<string>('cmd_get_local_cache_path', {
                messageId: file.id,
                fileName: file.name
            });

            await invoke('cmd_download_file', {
                req: {
                    message_id: file.id,
                    save_path: filePath,
                    folder_id: activeFolderId,
                    transfer_id: transferId
                }
            });

            await invoke('cmd_open_file_externally', { path: filePath });

        } catch (e) {
            console.error("Native play error:", e);
            setNativePlayError(String(e));
        } finally {
            if (unlisten) unlisten();
            setDownloadingNative(false);
            setDownloadProgress(0);
        }
    };

    const folderIdParam = activeFolderId !== null ? activeFolderId.toString() : 'home';
    const streamUrl = streamInfo
        ? `${streamInfo.base_url}/stream/${folderIdParam}/${file.id}?token=${streamInfo.token}`
        : null;
    const isVideo = isVideoFile(file.name, file.mime_type);
    const isAudio = isAudioFile(file.name, file.mime_type);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const key = e.key.toLowerCase();

            if (e.key === 'ArrowRight' || key === 'l') {
                e.preventDefault();
                e.stopPropagation();
                onNext?.();
                return;
            }

            if (e.key === 'ArrowLeft' || key === 'j') {
                e.preventDefault();
                e.stopPropagation();
                onPrev?.();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
            }

            if (key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                toggleFullscreen();
                return;
            }

            if (key === 'm') {
                e.preventDefault();
                e.stopPropagation();
                const media = mediaElementRef.current;
                if (media) {
                    media.muted = !media.muted;
                }
                return;
            }

            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;
                const media = mediaElementRef.current;
                if (media) {
                    if (media.paused) {
                        media.play().catch(() => {});
                    } else {
                        media.pause();
                    }
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onClose, onNext, onPrev, toggleFullscreen]);

    return (
        <div className={`fixed inset-0 z-[200] bg-black/95 animate-in fade-in duration-200 flex flex-col backdrop-blur-md`} onClick={onClose}>

            {/* Top Toolbar — unified across all file viewers */}
            <div
                className={`w-full flex items-center justify-between px-4 py-2.5 bg-[#161619] border-b border-white/10 shrink-0 shadow-lg text-white z-50 ${isFullscreen ? 'absolute top-0 left-0 right-0 transition-opacity duration-300' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Left File Title & Icon */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                        title="Close preview (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                        {isVideo ? (
                            <Film className="w-5 h-5 text-blue-400 shrink-0" />
                        ) : (
                            <Music className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        <h2 className="text-sm font-semibold truncate text-white" title={file.name}>
                            {file.name}
                        </h2>
                    </div>

                    {totalItems && totalItems > 1 && currentIndex !== undefined && (
                        <span className="text-xs text-telegram-subtext hidden sm:inline-block ml-1">
                            ({currentIndex + 1} of {totalItems})
                        </span>
                    )}

                    {isOfflineFile && (
                        <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Offline Storage
                        </span>
                    )}
                </div>

                {/* Right Tools & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                            title="Download File"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    )}

                    {isVideo && (
                        <button
                            onClick={handleOpenNative}
                            disabled={downloadingNative}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition disabled:opacity-50 cursor-pointer"
                            title="Open in System Player"
                        >
                            <ExternalLink className="w-5 h-5" />
                        </button>
                    )}

                    {onDelete && (
                        <button
                            onClick={() => { onDelete(file); onClose(); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                            title="Delete File"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Media content area — centered, takes remaining space */}
            <div className="flex-1 flex flex-col items-center justify-between p-2 sm:p-4 min-h-0" onClick={onClose}>
                <div ref={containerRef} className="relative w-full flex-1 flex flex-col justify-between max-w-6xl max-h-full min-h-0" onClick={e => e.stopPropagation()}>

                    {/* Main Media Display Box */}
                    <div className={`flex-1 w-full flex items-center justify-center relative bg-black overflow-hidden min-h-0 ${isFullscreen ? 'rounded-none border-none my-0' : 'rounded-2xl border border-white/10 my-1'}`}>
                        {onPrev && (
                            <button
                                onClick={onPrev}
                                className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 p-2.5 text-white/80 hover:text-white bg-black/60 hover:bg-black/80 border border-white/20 rounded-full transition-all z-20 shadow-lg cursor-pointer"
                                title="Previous (ArrowLeft / J)"
                            >
                                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        )}

                        {onNext && (
                            <button
                                onClick={onNext}
                                className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-2.5 text-white/80 hover:text-white bg-black/60 hover:bg-black/80 border border-white/20 rounded-full transition-all z-20 shadow-lg cursor-pointer"
                                title="Next (ArrowRight / L)"
                            >
                                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        )}

                        {downloadingNative ? (
                            <div className="flex flex-col items-center gap-4 text-white w-full max-w-md px-6">
                                <Loader2 className="w-8 h-8 text-telegram-primary animate-spin" />
                                <p className="text-sm font-medium">Preparing file for external player...</p>
                                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mt-2">
                                    <div 
                                        className="bg-telegram-primary h-full transition-all duration-300 rounded-full"
                                        style={{ width: `${downloadProgress}%` }}
                                    />
                                </div>
                                <span className="text-xs text-white/40">{downloadProgress}% downloaded</span>
                            </div>
                        ) : nativePlayError ? (
                            <div className="flex flex-col items-center gap-3 text-white px-8">
                                <AlertTriangle className="w-10 h-10 text-red-400" />
                                <p className="text-sm text-red-400 font-medium">Playback Error</p>
                                <p className="text-xs text-white/40 text-center max-w-md">{nativePlayError}</p>
                                <button
                                    onClick={handleOpenNative}
                                    className="mt-4 flex items-center gap-2 px-3.5 py-2 bg-telegram-primary hover:bg-telegram-primary/80 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open in Native System Player
                                </button>
                            </div>
                        ) : !streamUrl ? (
                            <div className="flex flex-col items-center gap-4 text-white">
                                <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-xs text-white/60">Preparing media...</p>
                            </div>
                        ) : isVideo ? (
                            <video
                                ref={mediaElementRef}
                                src={streamUrl}
                                controls
                                controlsList="nodownload noremoteplayback"
                                autoPlay
                                className="w-full h-full max-h-[85vh] object-contain"
                                onError={(e) => {
                                    console.error("Playback error on video element:", e);
                                    setNativePlayError("Failed to play video in browser (codec unsupported)");
                                }}
                            />
                        ) : isAudio ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-telegram-primary/20 to-black p-6">
                                <div className="w-32 h-32 rounded-full bg-telegram-surface flex items-center justify-center mb-8 shadow-xl animate-pulse-slow">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-telegram-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                                </div>
                                <audio ref={mediaElementRef as any} src={streamUrl} controls autoPlay className="w-full max-w-md" />
                            </div>
                        ) : (
                            <div className="text-white text-sm">Unsupported media type</div>
                        )}
                    </div>

                    {/* Keyboard shortcut hints footer */}
                    <div className="w-full py-1 text-center shrink-0">
                        <div className="hidden sm:flex items-center justify-center gap-4 text-[10px] text-white/30 select-none">
                            <span>Space: Play/Pause</span>
                            <span>F: Fullscreen</span>
                            <span>M: Mute</span>
                            <span>Esc: Close</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
