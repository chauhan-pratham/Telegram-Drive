import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, HardDrive, Trash2, FolderOpen, Pencil, Play, FileText, Copy, ArrowRightLeft, RotateCcw, Info, Star, CheckCircle2, Loader2, Share2 } from 'lucide-react';
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
    onRename?: () => void;
    onMove?: () => void;
    onShare?: () => void;
    onExportInvite?: (id: number, name: string) => void;
    folders?: TelegramFolder[];
    activeFolderId?: number | null;
}

export function ContextMenu({ x, y, file, onClose, onDownload, onDelete, onPreview, onRename, onMove, onShare: _onShare, onExportInvite, folders, activeFolderId }: ContextMenuProps) {
    const [adjustedPos, setAdjustedPos] = useState({ x, y });
    const menuRef = useRef<HTMLDivElement>(null);
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

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Handle single restore click
    const handleRestore = async () => {
        try {
            if (file.type === 'folder') {
                await restoreFolder(file.id);
            } else {
                await restoreFile(file.id);
            }
            onClose();
        } catch (e) {
            console.error('Failed to restore item:', e);
        }
    };

    return (
        <div
            ref={menuRef}
            style={{ top: `${adjustedPos.y}px`, left: `${adjustedPos.x}px` }}
            className="fixed z-50 w-52 bg-telegram-surface border border-telegram-border rounded-lg shadow-xl p-1 animate-in fade-in zoom-in-95 duration-100"
        >
            {/* Trash Tab Context Menu */}
            {currentTab === 'trash' ? (
                <>
                    <button
                        onClick={handleRestore}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer"
                    >
                        <RotateCcw className="w-4 h-4 text-telegram-primary" />
                        Restore
                    </button>
                    <div className="h-px bg-telegram-border my-1" />
                    <button
                        onClick={onDelete}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded transition-colors text-left w-full cursor-pointer"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete Permanently
                    </button>
                </>
            ) : (
                <>
                    {/* Open / Preview */}
                    {file.type === 'folder' ? (
                        <button onClick={onPreview} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                            <FolderOpen className="w-4 h-4 text-telegram-primary" />
                            Open
                        </button>
                    ) : (
                        <button onClick={onPreview} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                            {isMediaFile(file.name, file.mime_type) ? (
                                <>
                                    <Play className="w-4 h-4 text-telegram-primary" />
                                    Preview
                                </>
                            ) : isPdfFile(file.name, file.mime_type) ? (
                                <>
                                    <FileText className="w-4 h-4 text-telegram-primary" />
                                    Preview PDF
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4 text-telegram-primary" />
                                    Preview
                                </>
                            )}
                        </button>
                    )}

                    {/* Download */}
                    <button onClick={onDownload} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                        <HardDrive className="w-4 h-4 text-green-500" />
                        {file.type === 'folder' ? 'Download Folder' : 'Download'}
                    </button>

                    {/* View Details */}
                    <button
                        onClick={() => {
                            setIsInfoPanelOpen(true);
                            onClose();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer"
                    >
                        <Info className="w-4 h-4 text-telegram-primary" />
                        Details
                    </button>

                    {/* Star / Unstar */}
                    {file.type === 'folder' ? (
                        (() => {
                            const starred = isFolderStarred(file.id);
                            return (
                                <button
                                    onClick={() => {
                                        if (starred) {
                                            unstarFolder(file.id);
                                        } else {
                                            const itemFolder = folders?.find(f => f.id === file.id) || ({ id: file.id, name: file.name } as TelegramFolder);
                                            starFolder(itemFolder);
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer"
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
                                        } else {
                                            starFile(file);
                                        }
                                        onClose();
                                    }}
                                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer"
                                >
                                    <Star className={`w-4 h-4 text-amber-400 ${starred ? 'fill-amber-400' : ''}`} />
                                    {starred ? 'Remove from Starred' : 'Add to Starred'}
                                </button>
                            );
                        })()
                    )}

                    {/* Offline Access (Files) */}
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
                                        } else {
                                            makeAvailableOffline(file);
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

                    {/* Copy Link / Invite Link */}
                    {file.type === 'folder' ? (
                        (() => {
                            const folder = folders?.find(f => f.id === file.id);
                            if (!folder || file.id === -999) return null;

                            const handleGetInviteOrCopy = () => {
                                if (onExportInvite) {
                                    onExportInvite(folder.id, folder.name);
                                } else if (folder.username) {
                                    navigator.clipboard.writeText(`https://t.me/${folder.username}`);
                                    toast.success('Link copied!');
                                }
                                onClose();
                            };

                            return (
                                <button onClick={handleGetInviteOrCopy} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                                    <Share2 className="w-4 h-4 text-telegram-primary" />
                                    Get Link
                                </button>
                            );
                        })()
                    ) : (
                        (() => {
                            const folder = folders?.find(f => f.id === file.folder_id) || folders?.find(f => f.id === activeFolderId);
                            const username = folder?.username || (folder as any)?.chat?.username || (folder as any)?.channel?.username;
                            
                            if (!username) return null;

                            const handleCopyLink = async () => {
                                const url = `https://t.me/${username}/${file.id}`;
                                try {
                                    await navigator.clipboard.writeText(url);
                                    toast.success('Link copied to clipboard');
                                } catch {
                                    toast.error('Failed to copy link');
                                }
                                onClose();
                            };
                            return (
                                <button onClick={handleCopyLink} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                                    <Copy className="w-4 h-4 text-telegram-primary" />
                                    Copy Link
                                </button>
                            );
                        })()
                    )}

                    {/* Move to Folder */}
                    {onMove && !(file.type === 'folder' && (file.id === -999 || file.name === 'Saved Messages')) && (
                        <button onClick={onMove} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                            Move to Folder
                        </button>
                    )}

                    {/* Rename */}
                    {onRename && !(file.type === 'folder' && (file.id === -999 || file.name === 'Saved Messages')) && (
                        <button onClick={onRename} className="flex items-center gap-2 px-2 py-1.5 text-sm text-telegram-text hover:bg-telegram-hover rounded transition-colors text-left w-full cursor-pointer">
                            <Pencil className="w-4 h-4 text-blue-400" />
                            Rename
                        </button>
                    )}

                    {/* Delete */}
                    {!(file.type === 'folder' && (file.id === -999 || file.name === 'Saved Messages')) && (
                        <>
                            <div className="h-px bg-telegram-border my-1" />
                            <button onClick={onDelete} className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors text-left w-full cursor-pointer">
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
