import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, HardDrive, Trash2, FolderOpen, Pencil, Play, FileText, Copy, ArrowRightLeft, RotateCcw, Info, Star, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TelegramFile, TelegramFolder } from '../../../types';
import { isMediaFile, isPdfFile } from '../../../utils';
import { toast } from 'sonner';
import { useDrive } from '../../../context/DriveContext';

interface ContextMenuProps {
    x: number;
    y: number;
    file: TelegramFile;
    onClose: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onPreview: () => void;
    onShare?: () => void;
    onRename?: () => void;
    onMove?: () => void;
    folders?: TelegramFolder[];
    activeFolderId?: number | null;
}

export function ContextMenu({ x, y, file, onClose, onDownload, onDelete, onPreview, onShare: _onShare, onRename, onMove, folders, activeFolderId }: ContextMenuProps) {
    const [adjustedPos, setAdjustedPos] = useState({ x, y });
    const menuRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const { currentTab, restoreFile, restoreFolder, setIsInfoPanelOpen, isStarred, starFile, unstarFile, isFolderStarred, starFolder, unstarFolder, getOfflineState, makeAvailableOffline, removeOfflineAccess } = useDrive();

    // Adjust position to stay in bounds
    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newX = x;
            let newY = y;

            if (x + rect.width > window.innerWidth) {
                newX = x - rect.width;
            }
            if (y + rect.height > window.innerHeight) {
                newY = y - rect.height;
            }
            setAdjustedPos({ x: newX, y: newY });
        }
    }, [x, y]);

    // Close on outside click or Escape key press
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        const handleResize = () => onClose();

        window.addEventListener('click', handleClick);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleResize);
        window.addEventListener('contextmenu', handleClick);

        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('contextmenu', handleClick);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[200px] bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-lg shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5"
            style={{ left: adjustedPos.x, top: adjustedPos.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="px-2 py-1.5 text-xs text-telegram-subtext font-medium truncate max-w-[180px] border-b border-telegram-border mb-1">
                {file.name}
            </div>

            {currentTab === 'trash' ? (
                <>
                    <button
                        onClick={() => {
                            if (file.type === 'folder') {
                                restoreFolder(file.id);
                                toast.success(`Restored folder "${file.name}"`);
                            } else {
                                restoreFile(file.id);
                                toast.success(`Restored "${file.name}"`);
                            }
                            onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full"
                    >
                        <RotateCcw className="w-4 h-4 text-emerald-400" />
                        Restore
                    </button>
                    <div className="h-px bg-telegram-border my-1" />
                    <button
                        onClick={() => {
                            onDelete();
                            onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors text-left w-full"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete Permanently
                    </button>
                </>
            ) : (
                <>
                    {file.type !== 'folder' && (
                        <button onClick={onPreview} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full">
                            {isMediaFile(file.name, file.mime_type) ? (
                                <>
                                    <Play className="w-4 h-4 text-telegram-primary" />
                                    {t('common.play')}
                                </>
                            ) : isPdfFile(file.name, file.mime_type) ? (
                                <>
                                    <FileText className="w-4 h-4 text-red-400" />
                                    {t('files.view_pdf')}
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4 text-blue-500" />
                                    {t('files.preview')}
                                </>
                            )}
                        </button>
                    )}

                    {file.type === 'folder' && (
                        <button onClick={onPreview} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full">
                            <FolderOpen className="w-4 h-4 text-yellow-500" />
                            {t('files.open')}
                        </button>
                    )}

                    <button
                        onClick={() => {
                            setIsInfoPanelOpen(true);
                            onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full"
                    >
                        <Info className="w-4 h-4 text-telegram-primary" />
                        {t('files.view_details', 'View Details')}
                    </button>

                    {file.type === 'folder' ? (
                        (() => {
                            const starred = isFolderStarred(file.id);
                            return (
                                <button
                                    onClick={() => {
                                        if (starred) {
                                            unstarFolder(file.id);
                                            toast.success(`Removed "${file.name}" from Starred`);
                                        } else {
                                            const itemFolder = folders?.find(f => f.id === file.id) || ({ id: file.id, name: file.name } as TelegramFolder);
                                            starFolder(itemFolder);
                                            toast.success(`Added "${file.name}" to Starred`);
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full"
                                >
                                    <Star className={`w-4 h-4 text-amber-400 ${starred ? 'fill-amber-400' : ''}`} />
                                    {starred ? 'Remove from Starred' : 'Add to Starred'}
                                </button>
                            );
                        })()
                    ) : (
                        (() => {
                            const starred = isStarred(file.id);
                            return (
                                <button
                                    onClick={() => {
                                        if (starred) {
                                            unstarFile(file.id);
                                            toast.success(`Removed "${file.name}" from Starred`);
                                        } else {
                                            starFile(file);
                                            toast.success(`Added "${file.name}" to Starred`);
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full"
                                >
                                    <Star className={`w-4 h-4 text-amber-400 ${starred ? 'fill-amber-400' : ''}`} />
                                    {starred ? 'Remove from Starred' : 'Add to Starred'}
                                </button>
                            );
                        })()
                    )}

                    {file.type !== 'folder' && (
                        (() => {
                            const offlineState = getOfflineState(file.id);
                            const label = offlineState.isDownloading 
                                ? `Downloading (${offlineState.progress}%)`
                                : (offlineState.isReady ? 'Remove offline access' : 'Make available offline');

                            return (
                                <button
                                    onClick={() => {
                                        if (offlineState.isOffline) {
                                            removeOfflineAccess(file.id);
                                            toast.success(`Removed offline access for "${file.name}"`);
                                        } else {
                                            makeAvailableOffline(file);
                                            toast.info(`Downloading "${file.name}" for offline access...`);
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer"
                                >
                                    {offlineState.isDownloading ? (
                                        <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className={`w-4 h-4 ${offlineState.isReady ? 'text-emerald-400 fill-emerald-400/20' : 'text-telegram-subtext'}`} />
                                    )}
                                    {label}
                                </button>
                            );
                        })()
                    )}

                    {file.type !== 'folder' && (
                        <button onClick={onDownload} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full">
                            <HardDrive className="w-4 h-4 text-green-500" />
                            {t('files.download')}
                        </button>
                    )}

                    {file.type !== 'folder' && (
                        (() => {
                            const folder = folders?.find(f => f.id === file.folder_id) || folders?.find(f => f.id === activeFolderId);
                            const username = folder?.username || (folder as any)?.chat?.username || (folder as any)?.channel?.username;
                            
                            if (!username) return null;

                            const handleCopyLink = async () => {
                                const url = `https://t.me/${username}/${file.id}`;
                                try {
                                    await navigator.clipboard.writeText(url);
                                    toast.success(t('notifications.telegram_link_copied'));
                                } catch (e) {
                                    toast.error(t('notifications.copy_link_failed'));
                                }
                                onClose();
                            };
                            return (
                                <button onClick={handleCopyLink} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                                    <Copy className="w-4 h-4 text-telegram-primary" />
                                    {t('files.copy_telegram_link')}
                                </button>
                            );
                        })()
                    )}

                    {file.type !== 'folder' && onMove && (
                        <button onClick={onMove} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full">
                            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                            {t('files.move_to_folder')}
                        </button>
                    )}

                    {file.type !== 'folder' && onRename && (
                        <button onClick={onRename} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full">
                            <Pencil className="w-4 h-4 text-blue-400" />
                            {t('files.rename')}
                        </button>
                    )}

                    {file.type !== 'folder' && !onRename && (
                        <button disabled className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-subtext hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-not-allowed opacity-50">
                            <Pencil className="w-4 h-4" />
                            {t('files.rename')}
                        </button>
                    )}

                    {!(file.type === 'folder' && (file.id === -999 || file.name === 'Saved Messages')) && (
                        <>
                            <div className="h-px bg-telegram-border my-1" />
                            <button onClick={onDelete} className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors text-left w-full">
                                <Trash2 className="w-4 h-4" />
                                {t('files.delete')}
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
