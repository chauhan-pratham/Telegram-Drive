import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Download, Trash2, X, Image as ImageIcon, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TelegramFile, TelegramFolder } from '../../../types';
import { isImageFile, isMediaFile, isPdfFile, isTextFile, isOfficeFile, isExecutableFile } from '../../../utils';
import { MediaPlayer } from './MediaPlayer';
import { PdfViewer } from './PdfViewer';
import { TextViewer } from './TextViewer';
import { OfficeViewer } from './OfficeViewer';
import { GenericFileViewer } from './GenericFileViewer';

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

    const isExecutable = isExecutableFile(file.name, file.mime_type);
    if (isExecutable) {
        return (
            <GenericFileViewer
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

    const isMedia = isMediaFile(file.name, file.mime_type);
    const isPdf = isPdfFile(file.name, file.mime_type);
    const isText = isTextFile(file.name, file.mime_type);
    const isOffice = isOfficeFile(file.name, file.mime_type);

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

    if (isText) {
        return (
            <TextViewer
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

    if (isOffice) {
        return (
            <OfficeViewer
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

    return (
        <GenericFileViewer
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


function ImagePreviewModal({
    file,
    onClose,
    onNext,
    onPrev,
    currentIndex,
    totalItems,
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

    // Image Magnifier & Pan States
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });

    const handleZoomIn = useCallback(() => setScale(s => Math.min(5, Number((s + 0.25).toFixed(2)))), []);
    const handleZoomOut = useCallback(() => setScale(s => {
        const next = Math.max(0.5, Number((s - 0.25).toFixed(2)));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
    }), []);
    const handleResetZoom = useCallback(() => {
        setScale(1);
        setRotation(0);
        setPan({ x: 0, y: 0 });
    }, []);
    const handleRotate = useCallback(() => setRotation(r => (r + 90) % 360), []);

    // Reset zoom & transform when file changes
    useEffect(() => {
        handleResetZoom();
    }, [file.id, handleResetZoom]);

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
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                handleZoomIn();
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                handleZoomOut();
            } else if (key === '0' || key === 'r') {
                e.preventDefault();
                handleResetZoom();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev, handleZoomIn, handleZoomOut, handleResetZoom]);

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

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.deltaY < 0) {
            setScale(s => Math.min(5, Number((s + 0.15).toFixed(2))));
        } else {
            setScale(s => {
                const next = Math.max(0.5, Number((s - 0.15).toFixed(2)));
                if (next <= 1) setPan({ x: 0, y: 0 });
                return next;
            });
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { ...pan };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPan({
            x: panStartRef.current.x + dx,
            y: panStartRef.current.y + dy,
        });
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (scale !== 1) {
            handleResetZoom();
        } else {
            setScale(2);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black flex flex-col justify-between overflow-hidden select-none" onClick={onClose}>
            {/* Top Toolbar — unified across all file viewers */}
            <div className="w-full flex items-center justify-between px-4 py-2.5 bg-[#161619] border-b border-white/10 shrink-0 shadow-lg text-white z-50" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                        title="Close preview (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                        <ImageIcon className="w-5 h-5 text-purple-400 shrink-0" />
                        <h2 className="text-sm font-semibold truncate text-white" title={file.name}>
                            {file.name}
                        </h2>
                    </div>

                    {totalItems && totalItems > 1 && currentIndex !== undefined && (
                        <span className="text-xs text-telegram-subtext hidden sm:inline-block ml-1">
                            ({currentIndex + 1} of {totalItems})
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Zoom & Rotation Pill */}
                    <div className="hidden sm:flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10 text-xs">
                        <button
                            onClick={handleZoomOut}
                            className="p-1 text-telegram-subtext hover:text-white rounded transition-colors cursor-pointer"
                            title="Zoom Out (-)"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleResetZoom}
                            className="text-xs text-white/90 hover:text-white font-mono font-medium min-w-[2.5rem] text-center cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-white/10"
                            title="Reset Zoom / Fit (0)"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="p-1 text-telegram-subtext hover:text-white rounded transition-colors cursor-pointer"
                            title="Zoom In (+)"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-[1px] h-3 bg-white/15 mx-0.5" />
                        <button
                            onClick={handleRotate}
                            className="p-1 text-telegram-subtext hover:text-white rounded transition-colors cursor-pointer"
                            title="Rotate Clockwise (90°)"
                        >
                            <RotateCw className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                            title="Download File"
                        >
                            <Download className="w-5 h-5" />
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

            {/* Central Media Viewer Viewport with Touch & Zoom Gestures */}
            <div
                className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-4 overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}
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
                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                        {isImageFile(file.name, file.mime_type) ? (
                            <img
                                src={src}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
                                alt="Preview"
                                draggable={false}
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
                                    transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
                                    cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                                }}
                                onClick={e => e.stopPropagation()}
                                onDoubleClick={handleDoubleClick}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
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
