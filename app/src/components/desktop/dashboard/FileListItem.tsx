import { useState } from 'react';
import { Folder, MoreVertical, Check, Star, CheckCircle2, Loader2 } from 'lucide-react';
import { TelegramFile } from '../../../types';
import { createDragGhost, formatDate } from '../../../utils';
import { FileTypeIcon } from '../../shared/FileTypeIcon';
import { useVideoMetadata } from '../../../hooks/useVideoMetadata';
import { useCachedVariants } from '../../../hooks/useCachedVariants';
import { VideoMetaBadge } from '../../shared/VideoMetaBadge';
import { useDrive } from '../../../context/DriveContext';

interface FileListItemProps {
    file: TelegramFile;
    selectedIds: number[];
    onFileClick: (e: React.MouseEvent, id: number) => void;
    handleContextMenu: (e: React.MouseEvent, file: TelegramFile) => void;
    onDragStart?: (fileIds: number[]) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
}

export function FileListItem({
    file, selectedIds, onFileClick, handleContextMenu,
    onDragStart, onDragEnd, onDrop
}: FileListItemProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFolder = file.type === 'folder';

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

    const displayName = (file.name && file.name.trim()) 
        ? file.name 
        : (isFolder ? 'Untitled Folder' : (file.mime_type?.includes('video') ? `video_${file.id}.mp4` : `file_${file.id}`));

    return (
        <div
            onClick={(e) => onFileClick(e, file.id)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable={!isFolder}
            onDragStart={(e) => {
                const idsToDrag = selectedIds.includes(file.id) ? selectedIds : [file.id];
                if (onDragStart) onDragStart(idsToDrag);
                e.dataTransfer.setData("application/x-telegram-file-ids", JSON.stringify(idsToDrag));
                e.dataTransfer.effectAllowed = 'move';
                const dragCount = idsToDrag.length;
                const ghost = createDragGhost(displayName, isFolder, dragCount);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
            }}
            onDragEnd={onDragEnd}
            onDragOver={(e) => {
                if (isFolder && !selectedIds.includes(file.id)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(true);
                }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                if (isFolder && !selectedIds.includes(file.id)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    onDrop?.(e, file.id);
                }
            }}
            className={`group grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] sm:grid-cols-[2rem_minmax(0,2fr)_6.5rem_11rem_2.5rem] gap-4 items-center px-4 py-3 rounded-lg cursor-pointer border border-transparent transition-all hover:bg-telegram-hover
                ${selectedIds.includes(file.id) ? 'bg-telegram-primary/10 border-telegram-primary/20' : ''}
                ${isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20' : ''}
            `}
        >
            <div className="flex justify-center">
                {isFolder ? <Folder className="w-5 h-5 text-telegram-primary" /> : <FileTypeIcon filename={displayName} className="w-5 h-5" />}
            </div>
            <div className="min-w-0 truncate text-sm text-telegram-text font-medium flex items-center gap-1.5">
                <span className="truncate" title={displayName}>{displayName}</span>
                {itemStarred && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Starred" />}
                {offlineState?.isDownloading && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded-md shrink-0 animate-pulse" title={`Downloading for offline access (${offlineState.progress}%)`}>
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                        <span>{offlineState.progress}%</span>
                    </span>
                )}
                {offlineState?.isReady && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-400 shrink-0" title="Available offline (Stored on local disk)">
                        <CheckCircle2 className="w-3.5 h-3.5 fill-emerald-400/20" />
                    </span>
                )}
                <VideoMetaBadge metadata={videoMeta} isLoading={videoMetaLoading} />
                {cachedQualities.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 ml-1.5">
                        {cachedQualities.map(q => (
                            <span key={q} className="inline-flex items-center gap-0.5 text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">
                                <Check className="w-2.5 h-2.5" />
                                {q}
                            </span>
                        ))}
                    </span>
                )}
            </div>
            <div className="hidden sm:block text-right text-xs text-telegram-subtext truncate">{file.sizeStr}</div>
            <div className="hidden sm:block text-right text-xs text-telegram-subtext font-mono truncate">{formatDate(file.created_at)}</div>

            {/* 3-dot Menu Button — in grid flow, not absolutely positioned */}
            <div className="flex justify-end">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(e, file);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 bg-telegram-surface hover:bg-telegram-hover border border-telegram-border shadow-md rounded text-telegram-subtext hover:text-telegram-text transition-all"
                    aria-label="File actions"
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
