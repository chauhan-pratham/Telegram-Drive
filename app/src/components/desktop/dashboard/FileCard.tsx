import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Folder, Check, Star, CheckCircle2, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../../types';
import { createDragGhost } from '../../../utils';
import { FileTypeIcon } from '../../shared/FileTypeIcon';
import { useVideoMetadata } from '../../../hooks/useVideoMetadata';
import { useCachedVariants } from '../../../hooks/useCachedVariants';
import { VideoMetaBadge } from '../../shared/VideoMetaBadge';
import { useDrive } from '../../../context/DriveContext';

interface FileCardProps {
    file: TelegramFile;
    onDelete: () => void;
    onDownload: () => void;
    onPreview?: () => void;
    onShare?: () => void;
    isSelected: boolean;
    onClick?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileIds: number[]) => void;
    onDragEnd?: () => void;
    activeFolderId?: number | null;
    height?: number;
    onToggleSelection?: () => void;
    selectedIds?: number[];
}

interface StreamInfo {
    token: string;
    base_url: string;
}

let streamInfoPromise: Promise<StreamInfo> | null = null;

function getStreamInfo(): Promise<StreamInfo> {
    streamInfoPromise ??= invoke<StreamInfo>('cmd_get_stream_info');
    return streamInfoPromise;
}

const thumbnailCache = new Map<string, string>();
function setCachedThumbnail(key: string, value: string) {
    if (thumbnailCache.size >= 1000) {
        const firstKey = thumbnailCache.keys().next().value;
        if (firstKey !== undefined) {
            thumbnailCache.delete(firstKey);
        }
    }
    thumbnailCache.set(key, value);
}
async function getVideoThumbnailStreamUrl(file: TelegramFile, folderId: number | null | undefined): Promise<string> {
    const streamInfo = await getStreamInfo();
    const folderKey = folderId === null || folderId === undefined ? 'home' : folderId.toString();
    return `${streamInfo.base_url}/stream/${folderKey}/${file.id}?token=${streamInfo.token}`;
}

function isImageFile(filename: string, mime?: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) || Boolean(mime?.startsWith('image/'));
}

function isVideoFile(filename: string, mime?: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'webm', 'avi', 'mov'].includes(ext)) return true;
    if (mime?.startsWith('video/')) return true;
    return false;
}

export function FileCard({ file, onDelete: _onDelete, onDownload: _onDownload, onPreview: _onPreview, onShare: _onShare, isSelected, onClick, onContextMenu, onDrop, onDragStart, onDragEnd, activeFolderId, height, onToggleSelection: _onToggleSelection, selectedIds }: FileCardProps) {
    const isFolder = file.type === 'folder';
    const [isDragOver, setIsDragOver] = useState(false);
    const cacheKey = `${file.folder_id ?? activeFolderId}_${file.id}`;
    const [thumbnail, setThumbnail] = useState<string | null>(() => thumbnailCache.get(cacheKey) || null);
    const [videoThumbnailUrl, setVideoThumbnailUrl] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const { isStarred, isFolderStarred, getOfflineState } = useDrive();
    const itemStarred = isFolder ? isFolderStarred(file.id) : isStarred(file.id);
    const offlineState = !isFolder ? getOfflineState(file.id) : null;

    // Lazy video metadata badge (.mp4 only)
    const { data: videoMeta, isLoading: videoMetaLoading } = useVideoMetadata(
        file.id,
        file.folder_id ?? null,
        file.name,
    );

    // Cached HLS variants
    const { data: cachedVariants } = useCachedVariants(
        file.id,
        file.folder_id ?? null,
        file.name,
    );
    const cachedQualities = (cachedVariants || []).filter(v => v.available).map(v => v.quality);

    // Intersection Observer to restrict preview building to viewport active elements
    useEffect(() => {
        if (isFolder) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' }
        );

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, [isFolder]);

    // Only image and video cards receive visual thumbnails. Documents keep
    // their file-type icon so browsing does not trigger expensive rendering.
    useEffect(() => {
        if (isFolder || !isVisible) return;
        if (thumbnailCache.has(cacheKey)) return;

        let cancelled = false;
        let timeoutId: any = null;

        const loadThumbnail = () => {
            if (
                isImageFile(file.name, file.mime_type)
                || isVideoFile(file.name, file.mime_type)
            ) {
                setThumbnailLoading(true);
                invoke<string>('cmd_get_thumbnail', {
                    messageId: file.id,
                    folderId: file.folder_id ?? activeFolderId
                }).then(async (result) => {
                    if (!cancelled && result) {
                        setCachedThumbnail(cacheKey, result);
                        setThumbnail(result);
                    } else if (!cancelled && isVideoFile(file.name, file.mime_type)) {
                        // FFmpeg is optional. Render a paused video element
                        // when Telegram has no embedded cover image; this
                        // displays a decoded frame without canvas/CORS issues.
                        const streamUrl = await getVideoThumbnailStreamUrl(file, file.folder_id ?? activeFolderId);
                        if (!cancelled) setVideoThumbnailUrl(streamUrl);
                    }
                }).catch((error) => {
                    // Keep the card usable, but expose the reason in the
                    // developer console instead of masking a broken thumbnail
                    // pipeline behind a generic file icon.
                    console.warn("Thumbnail failed for", file.name, error);
                }).finally(() => {
                    if (!cancelled) setThumbnailLoading(false);
                });
            }
        };

        // Debounce loading by 300ms to balance performance during virtual scrolling
        timeoutId = setTimeout(loadThumbnail, 300);

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [file.id, file.name, file.mime_type, activeFolderId, isFolder, isVisible, cacheKey]);

    return (
        <div
            ref={cardRef}
            className="relative"
            draggable={!isFolder}
            onContextMenu={onContextMenu}
            onClick={onClick}
            onDragStart={!isFolder ? (e: any) => {
                const idsToDrag = selectedIds && selectedIds.includes(file.id) ? selectedIds : [file.id];
                if (onDragStart) onDragStart(idsToDrag);
                e.dataTransfer.setData("application/x-telegram-file-ids", JSON.stringify(idsToDrag));
                e.dataTransfer.effectAllowed = 'move';
                const dragCount = idsToDrag.length;
                const ghost = createDragGhost(file.name, isFolder, dragCount);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
            } : undefined}
            onDragEnd={!isFolder ? () => {
                if (onDragEnd) onDragEnd();
            } : undefined}
            onDragOver={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDragOver) setIsDragOver(true);
                }
            }}
            onDragLeave={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                }
            }}
            onDrop={(e) => {
                if (isFolder && onDrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    onDrop(e, file.id);
                }
            }}
        >
            <motion.div
                whileHover={{ y: -4 }}
                className={`group cursor-pointer bg-telegram-surface rounded-2xl overflow-hidden border hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition-all relative border-telegram-border/50
                ${isSelected ? 'border-telegram-primary bg-telegram-primary/5 ring-1 ring-telegram-primary font-semibold' : 'hover:border-telegram-primary/40'}
                ${isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20 scale-105' : ''}`}
                style={height ? { height: `${height}px` } : { aspectRatio: '4/3' }}
            >
                {/* Thumbnail or Icon */}
                {thumbnail ? (
                    <div className="absolute inset-0">
                        <img
                            src={thumbnail}
                            alt={file.name}
                            className="w-full h-full object-contain"
                        />
                        {/* Gradient overlay for text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    </div>
                ) : videoThumbnailUrl ? (
                    <div className="absolute inset-0 bg-black">
                        <video
                            src={videoThumbnailUrl}
                            muted
                            playsInline
                            preload="auto"
                            className="w-full h-full object-contain pointer-events-none"
                            onLoadedMetadata={(e) => {
                                const video = e.currentTarget;
                                if (Number.isFinite(video.duration) && video.duration > 0) {
                                    video.currentTime = Math.min(0.25, video.duration / 10);
                                }
                            }}
                            onError={() => setVideoThumbnailUrl(null)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                    </div>
                ) : (
                    <div className="absolute inset-x-0 top-0 bottom-14 flex items-center justify-center p-4">
                        {isFolder ? (
                            <Folder className="w-12 h-12 text-telegram-primary max-h-full max-w-full shrink-0" />
                        ) : thumbnailLoading && (isImageFile(file.name, file.mime_type) || isVideoFile(file.name, file.mime_type)) ? (
                            <div className="w-8 h-8 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin shrink-0" />
                        ) : (
                            <FileTypeIcon filename={file.name} size="lg" className="w-12 h-12 max-h-full max-w-full shrink-0" />
                        )}
                    </div>
                )}

                {itemStarred && (
                    <div className="absolute top-2 left-2 rounded-full bg-amber-500/20 border border-amber-500/50 p-1 text-amber-400 backdrop-blur-md shadow-sm z-10" title="Starred item">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </div>
                )}

                {offlineState?.isDownloading && (
                    <div className="absolute top-2 right-2 rounded-full bg-sky-500/20 border border-sky-500/50 px-2 py-0.5 text-sky-400 backdrop-blur-md shadow-sm z-10 flex items-center gap-1 text-[10px] font-semibold animate-pulse" title={`Downloading for offline access (${offlineState.progress}%)`}>
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                        <span>{offlineState.progress}%</span>
                    </div>
                )}

                {offlineState?.isReady && (
                    <div className="absolute top-2 right-2 rounded-full bg-emerald-500/20 border border-emerald-500/50 p-1 text-emerald-400 backdrop-blur-md shadow-sm z-10" title="Available offline (Stored on local disk)">
                        <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-400/20" />
                    </div>
                )}



                {/* File info overlay at bottom */}
                {(() => {
                    const displayName = (file.name && file.name.trim()) 
                        ? file.name 
                        : (isFolder ? 'Untitled Folder' : (file.mime_type?.includes('video') ? `video_${file.id}.mp4` : `file_${file.id}`));
                    return (
                        <div className={`absolute bottom-0 left-0 right-0 p-3 ${thumbnail ? 'text-white' : 'text-telegram-text'}`}>
                            <h3 className="text-sm font-medium truncate w-full min-w-0" title={displayName}>{displayName}</h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 w-full min-w-0 overflow-hidden">
                                <p className={`text-xs shrink-0 ${thumbnail ? 'text-white/70' : 'text-telegram-subtext'}`}>{file.sizeStr}</p>
                                <VideoMetaBadge metadata={videoMeta} isLoading={videoMetaLoading} />
                                {cachedQualities.length > 0 && (
                                    <span className="inline-flex items-center gap-0.5 shrink-0">
                                        {cachedQualities.map(q => (
                                            <span key={q} className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                                                <Check className="w-2.5 h-2.5" />
                                                {q}
                                            </span>
                                        ))}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </motion.div>
        </div>
    )
}
