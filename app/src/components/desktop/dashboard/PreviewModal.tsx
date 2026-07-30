import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TelegramFile, TelegramFolder } from '../../../types';
import { isImageFile, isMediaFile, isPdfFile } from '../../../utils';
import { MediaPlayer } from './MediaPlayer';
import { PdfViewer } from './PdfViewer';

const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_MAX_ITEMS = 8;

type PreviewCacheValue = {
    src: string;
    cachedAt: number;
};

const previewCache = new Map<string, PreviewCacheValue>();
const pendingPrefetch = new Set<string>();

const getPreviewCacheKey = (fileId: number, folderId: number | null) => `${folderId ?? 'home'}:${fileId}`;

const touchPreviewCache = (key: string, value: PreviewCacheValue) => {
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, value);

    while (previewCache.size > PREVIEW_CACHE_MAX_ITEMS) {
        const oldestKey = previewCache.keys().next().value;
        if (!oldestKey) break;
        previewCache.delete(oldestKey);
    }
};

const getCachedPreview = (key: string): string | null => {
    const value = previewCache.get(key);
    if (!value) return null;

    if (Date.now() - value.cachedAt > PREVIEW_CACHE_TTL_MS) {
        previewCache.delete(key);
        return null;
    }

    touchPreviewCache(key, value);
    return value.src;
};

const rememberPreview = (key: string, src: string) => {
    touchPreviewCache(key, { src, cachedAt: Date.now() });
};

const forgetPreview = (key: string) => {
    previewCache.delete(key);
};

const isSafeToPrefetch = (f: TelegramFile) => isImageFile(f.name, f.mime_type);

interface PreviewModalProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    nextFile?: TelegramFile | null;
    prevFile?: TelegramFile | null;
    activeFolderId: number | null;
    folders?: TelegramFolder[];
    onDownload?: (file: TelegramFile) => void;
    onShare?: (file: TelegramFile) => void;
    onDelete?: (file: TelegramFile) => void;
}


export function PreviewModal(props: PreviewModalProps) {
    const { file, activeFolderId, onClose, onNext, onPrev, currentIndex, totalItems, onDownload, onShare, onDelete } = props;

    const isMedia = isMediaFile(file.name, file.mime_type);
    const isPdf = isPdfFile(file.name, file.mime_type);

    if (isMedia) {
        return (
            <MediaPlayer
                file={file}
                activeFolderId={activeFolderId}
                onClose={onClose}
                onNext={onNext}
                onPrev={onPrev}
                currentIndex={currentIndex}
                totalItems={totalItems}
                onDownload={onDownload}
                onShare={onShare}
                onDelete={onDelete}
            />
        );
    }

    if (isPdf) {
        return (
            <PdfViewer
                file={file}
                activeFolderId={activeFolderId}
                onClose={onClose}
                onNext={onNext}
                onPrev={onPrev}
                currentIndex={currentIndex}
                totalItems={totalItems}
                onDownload={onDownload}
                onShare={onShare}
                onDelete={onDelete}
            />
        );
    }

    if (isImageFile(file.name, file.mime_type)) {
        return <ImagePreviewModal {...props} />;
    }

    return null;
}


function ImagePreviewModal({
    file,
    onClose,
    onNext,
    onPrev,
    nextFile,
    prevFile,
    activeFolderId,
    onDownload,
    onShare: _onShare,
    onDelete,
}: PreviewModalProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const latestRequestRef = useRef(0);
    const hasRetriedRef = useRef(false);

    useEffect(() => {
        hasRetriedRef.current = false;
        const load = async () => {
            const key = getPreviewCacheKey(file.id, activeFolderId);
            const requestId = ++latestRequestRef.current;
            const cachedSrc = getCachedPreview(key);

            if (cachedSrc) {
                if (requestId !== latestRequestRef.current) return;
                setSrc(cachedSrc);
                setLoading(false);
                setError(null);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const path = await invoke<string>('cmd_get_preview', {
                    messageId: file.id,
                    folderId: activeFolderId
                });
                if (requestId !== latestRequestRef.current) return;

                if (path) {
                    if (path.startsWith('data:')) {
                        setSrc(path);
                        rememberPreview(key, path);
                    } else {
                        try {
                            const converted = convertFileSrc(path);
                            setSrc(converted);
                            rememberPreview(key, converted);
                        } catch (err) {
                            console.error("convertFileSrc failed:", err);
                            setError("Failed to load image preview");
                        }
                    }
                } else {
                    setError("Preview not available");
                }
            } catch (e) {
                if (requestId !== latestRequestRef.current) return;
                setError(String(e));
            } finally {
                if (requestId !== latestRequestRef.current) return;
                setLoading(false);
            }
        };
        load();
    }, [file, activeFolderId]);

    useEffect(() => {
        const candidates = [nextFile, prevFile].filter((f): f is TelegramFile => !!f && isSafeToPrefetch(f));

        candidates.forEach((candidate) => {
            const key = getPreviewCacheKey(candidate.id, activeFolderId);
            if (getCachedPreview(key) || pendingPrefetch.has(key)) return;

            pendingPrefetch.add(key);
            invoke<string>('cmd_get_preview', {
                messageId: candidate.id,
                folderId: activeFolderId
            }).then((path) => {
                if (!path) return;
                try {
                    const normalized = path.startsWith('data:') ? path : convertFileSrc(path);
                    rememberPreview(key, normalized);
                } catch {}
            }).catch(() => {
                // Ignore prefetch errors
            }).finally(() => {
                pendingPrefetch.delete(key);
            });
        });
    }, [nextFile, prevFile, activeFolderId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            const key = e.key.toLowerCase();
            if (key === 'arrowright' || key === 'l') {
                e.preventDefault();
                onNext?.();
            } else if (key === 'arrowleft' || key === 'j') {
                e.preventDefault();
                onPrev?.();
            } else if (key === 'escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    const touchStartX = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const diffX = e.changedTouches[0].clientX - touchStartX.current;
        if (diffX > 50) {
            onPrev?.();
        } else if (diffX < -50) {
            onNext?.();
        }
        touchStartX.current = null;
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col justify-between overflow-hidden select-none" onClick={onClose}>
            {/* Top Google Drive Header Bar */}
            <div className="w-full flex items-center justify-between px-4 py-3 bg-black/90 text-white z-50 border-b border-white/10 shrink-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 text-white cursor-pointer transition active:scale-95 shrink-0"
                        title="Back (Esc)"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <h2 className="text-sm sm:text-base font-semibold text-white truncate tracking-tight" title={file.name}>
                        {file.name}
                    </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all shrink-0 cursor-pointer"
                            title="Download"
                        >
                            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => { onDelete(file); onClose(); }}
                            className="p-2 text-red-400 hover:text-red-300 bg-white/10 hover:bg-red-500/20 rounded-full transition-all shrink-0 cursor-pointer"
                            title="Delete File"
                        >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}
                </div>

            </div>

            {/* Central Media Viewer Viewport with Touch Gestures */}
            <div
                className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {onPrev && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPrev(); }}
                        className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-lg border border-white/10"
                        title="Previous (ArrowLeft / J)"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}

                {onNext && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onNext(); }}
                        className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-lg border border-white/10"
                        title="Next (ArrowRight / L)"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}

                {loading && (
                    <div className="flex flex-col items-center gap-4 text-white" onClick={e => e.stopPropagation()}>
                        <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                        <p>Loading preview...</p>
                        <p className="text-xs text-white/50">Downloading from Telegram...</p>
                    </div>
                )}

                {error && (
                    <div className="text-red-400 bg-white/10 p-4 rounded-lg border border-red-500/20 max-w-md text-center" onClick={e => e.stopPropagation()}>
                        <p className="font-bold">Preview Error</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                )}

                {!loading && !error && src && (
                    <div className="w-full h-full flex items-center justify-center">
                        {isImageFile(file.name, file.mime_type) ? (
                            <img
                                src={src}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                alt="Preview"
                                onClick={e => e.stopPropagation()}
                                onLoad={() => {
                                    invoke('cmd_log', { message: `[preview] frontend.image_loaded file=${file.id}` }).catch(() => {});
                                }}
                                onError={async () => {
                                    invoke('cmd_log', { message: `[preview] frontend.image_error file=${file.id}` }).catch(() => {});
                                    if (hasRetriedRef.current) {
                                        setError('Failed to render image preview');
                                        return;
                                    }
                                    hasRetriedRef.current = true;

                                    const key = getPreviewCacheKey(file.id, activeFolderId);
                                    forgetPreview(key);
                                    try {
                                        const fallbackPath = await invoke<string>('cmd_get_preview', {
                                            messageId: file.id,
                                            folderId: activeFolderId
                                        });
                                        if (fallbackPath) {
                                            const converted = fallbackPath.startsWith('data:') ? fallbackPath : convertFileSrc(fallbackPath);
                                            if (converted !== src) {
                                                setSrc(converted);
                                                rememberPreview(key, converted);
                                                return;
                                            }
                                        }
                                    } catch (e) {
                                        console.error("Fallback image preview failed:", e);
                                    }
                                    setError('Failed to render image preview');
                                }}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
