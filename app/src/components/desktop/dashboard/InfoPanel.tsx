import { useState, useEffect } from 'react';
import { X, File, Star, Download, Pencil, Trash2, Folder, FolderInput, RotateCcw, Users, Share2 } from 'lucide-react';
import { TelegramFile, TelegramFolder, FolderParticipantInfo } from '../../../types';
import { FileTypeIcon } from '../../shared/FileTypeIcon';
import { useDrive } from '../../../context/DriveContext';
import { toast } from 'sonner';
import { formatDate } from '../../../utils';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

interface FolderMembersSectionProps {
    folderId: number;
}

function FolderMembersSection({ folderId }: FolderMembersSectionProps) {
    const { setFolders } = useDrive();
    
    const { data: participants = [], isLoading } = useQuery<FolderParticipantInfo[]>({
        queryKey: ['folder-participants', folderId],
        queryFn: async () => {
            return await invoke<FolderParticipantInfo[]>('cmd_get_folder_participants', { folderId });
        },
        enabled: folderId !== undefined && folderId > 0,
    });

    useEffect(() => {
        if (!isLoading && participants.length > 0) {
            try {
                const storedSharedStr = localStorage.getItem('tg_drive_shared_folders') || '[]';
                const sharedList = JSON.parse(storedSharedStr) as number[];
                if (!sharedList.includes(folderId)) {
                    sharedList.push(folderId);
                    localStorage.setItem('tg_drive_shared_folders', JSON.stringify(sharedList));
                    // Update main state so UI folder card overlays update instantly
                    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, is_shared: true } : f));
                }
            } catch (e) {
                console.error(e);
            }
        }
    }, [participants, isLoading, folderId, setFolders]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-telegram-primary"></div>
            </div>
        );
    }

    if (participants.length <= 1) {
        return null;
    }

    return (
        <div className="mt-4 border-t border-telegram-border/50 pt-4">
            <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Folder Members ({participants.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {participants.map((p, idx) => {
                    const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() || '?';
                    return (
                        <div key={idx} className="flex items-center gap-2.5 p-1.5 rounded hover:bg-telegram-hover/30 transition-colors">
                            <div className="w-7 h-7 rounded-full bg-telegram-primary/10 border border-telegram-primary/20 flex items-center justify-center text-telegram-primary text-xs font-semibold">
                                {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-telegram-text truncate">
                                    {p.first_name} {p.last_name || ''}
                                </p>
                                {p.username && (
                                    <p className="text-[10px] text-telegram-subtext truncate">@{p.username}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface InfoPanelProps {
    selectedFiles: TelegramFile[];
    selectedFolders: TelegramFolder[];
    folders: TelegramFolder[];
    onClose?: () => void;
    onDownload: (file: TelegramFile) => void;
    onDelete: (file: TelegramFile) => void;
    onRename: (file: TelegramFile) => void;
    onMove: (file: TelegramFile) => void;
    onFolderRename: (id: number, name: string) => void;
    onFolderDelete: (id: number, name: string) => void;
    activeFolderId: number | null;
}

export function InfoPanel({
    selectedFiles,
    selectedFolders,
    folders,
    onClose: _onClose,
    onDownload,
    onDelete,
    onRename,
    onMove,
    onFolderRename,
    onFolderDelete,
    activeFolderId
}: InfoPanelProps) {
    const { setIsInfoPanelOpen, isStarred, starFile, unstarFile, isFolderStarred, starFolder, unstarFolder, currentTab, restoreFile, restoreFolder } = useDrive();
    const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');

    const totalSelected = selectedFiles.length + selectedFolders.length;

    const activeFolder = activeFolderId !== null ? folders.find(f => f.id === activeFolderId) : null;
    let rootName = '';
    let rootIcon = <Folder className="w-14 h-14 text-telegram-primary/80" />;

    if (activeFolderId === null) {
        if (currentTab === 'my-drive') {
            rootName = 'My Drive';
        } else if ((currentTab as string) === 'saved-messages') {
            rootName = 'Saved Messages';
        } else if (currentTab === 'starred') {
            rootName = 'Starred';
            rootIcon = <Star className="w-14 h-14 text-amber-400" />;
        } else if (currentTab === 'trash') {
            rootName = 'Trash';
            rootIcon = <Trash2 className="w-14 h-14 text-red-400" />;
        } else if (currentTab === 'shared') {
            rootName = 'Shared with me';
            rootIcon = <Share2 className="w-14 h-14 text-telegram-primary/80" />;
        } else {
            rootName = currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
        }
    }

    // Helper: format file sizes
    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Helper: find folder name by ID
    const getFolderName = (fId: number | null) => {
        if (fId === null) return 'Saved Messages';
        const folder = folders.find(f => f.id === fId);
        return folder ? folder.name : 'Unknown Folder';
    };

    return (
        <aside className="info-panel w-80 bg-telegram-surface border-l border-telegram-border flex flex-col h-full flex-shrink-0 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-telegram-text">
                    <span>Details</span>
                </div>
                <button
                    onClick={() => setIsInfoPanelOpen(false)}
                    className="p-1 hover:bg-telegram-hover text-telegram-subtext hover:text-telegram-text rounded-md transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {totalSelected === 0 ? (
                /* Active Folder/Root Details View when nothing is selected */
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-100">
                    {/* Tabs */}
                    <div className="flex border-b border-telegram-border text-xs">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                                activeTab === 'details'
                                    ? 'border-telegram-primary text-telegram-primary'
                                    : 'border-transparent text-telegram-subtext hover:text-telegram-text'
                            }`}
                        >
                            Details
                        </button>
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                                activeTab === 'activity'
                                    ? 'border-telegram-primary text-telegram-primary'
                                    : 'border-transparent text-telegram-subtext hover:text-telegram-text'
                            }`}
                        >
                            Activity
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {activeFolder ? (
                            /* Render Active Folder Details */
                            <>
                                <div className="w-full h-32 bg-telegram-hover/30 border border-telegram-border/50 rounded-xl flex items-center justify-center relative group">
                                    <Folder className="w-14 h-14 text-telegram-primary/80" />
                                    <button
                                        onClick={() => isFolderStarred(activeFolder.id) ? unstarFolder(activeFolder.id) : starFolder(activeFolder)}
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-telegram-surface/80 border border-telegram-border/50 text-amber-400 hover:scale-110 transition-transform"
                                        title={isFolderStarred(activeFolder.id) ? "Remove Star" : "Add Star"}
                                    >
                                        <Star className="w-4 h-4" fill={isFolderStarred(activeFolder.id) ? "currentColor" : "none"} />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold text-telegram-text text-sm break-all">{activeFolder.name}</h3>

                                    {activeTab === 'details' ? (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Properties</h4>
                                            <div className="grid grid-cols-3 gap-y-3.5 text-xs border-b border-telegram-border/30 pb-4">
                                                <span className="text-telegram-subtext col-span-1">Type:</span>
                                                <span className="text-telegram-text col-span-2">Folder Channel</span>

                                                <span className="text-telegram-subtext col-span-1">Visibility:</span>
                                                <span className="text-telegram-text col-span-2">
                                                    {activeFolder.is_public || activeFolder.username ? 'Public' : 'Private'}
                                                </span>

                                                <span className="text-telegram-subtext col-span-1">Channel ID:</span>
                                                <span className="text-telegram-text col-span-2 font-mono truncate">{activeFolder.id}</span>
                                            </div>

                                            <FolderMembersSection folderId={activeFolder.id} />

                                            <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider pt-2">Quick Actions</h4>
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => isFolderStarred(activeFolder.id) ? unstarFolder(activeFolder.id) : starFolder(activeFolder)}
                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors w-full"
                                                >
                                                    <Star className={`w-3.5 h-3.5 ${isFolderStarred(activeFolder.id) ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}`} />
                                                    {isFolderStarred(activeFolder.id) ? 'Remove from Starred' : 'Add to Starred'}
                                                </button>
                                                {onFolderRename && (
                                                    <button
                                                        onClick={() => onFolderRename(activeFolder.id, activeFolder.name)}
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors w-full"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        Rename Folder
                                                    </button>
                                                )}
                                                {onFolderDelete && (
                                                    <button
                                                        onClick={() => onFolderDelete(activeFolder.id, activeFolder.name)}
                                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors w-full"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Delete Folder
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Activity Feed */
                                        <div className="space-y-4 relative before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-telegram-border/40">
                                            <div className="flex gap-3 relative z-10">
                                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="text-telegram-text font-medium">Folder Mapped</p>
                                                    <p className="text-[11px] text-telegram-subtext mt-0.5">Channel ID: {activeFolder.id}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 relative z-10">
                                                <div className="w-4 h-4 rounded-full bg-telegram-primary/20 border border-telegram-primary/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-telegram-primary" />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="text-telegram-text font-medium">Access Rights</p>
                                                    <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                        {activeFolder.is_public || activeFolder.username ? 'Public Channel Access' : 'Private Channel Access'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 relative z-10">
                                                <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="text-telegram-text font-medium">Storage Sync</p>
                                                    <p className="text-[11px] text-telegram-subtext mt-0.5">Connected to Telegram Cloud</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Render Root/System Location Details */
                            <>
                                <div className="w-full h-32 bg-telegram-hover/30 border border-telegram-border/50 rounded-xl flex items-center justify-center">
                                    {rootIcon}
                                </div>

                                <div className="space-y-4">
                                    <h3 className="font-semibold text-telegram-text text-sm break-all">{rootName}</h3>

                                    {activeTab === 'details' ? (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Properties</h4>
                                            <div className="grid grid-cols-3 gap-y-3.5 text-xs pb-4">
                                                <span className="text-telegram-subtext col-span-1">Type:</span>
                                                <span className="text-telegram-text col-span-2">System Directory</span>

                                                <span className="text-telegram-subtext col-span-1">Access:</span>
                                                <span className="text-telegram-text col-span-2">Authorized Account</span>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Activity Feed */
                                        <div className="space-y-4 relative before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-telegram-border/40">
                                            <div className="flex gap-3 relative z-10">
                                                <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="text-telegram-text font-medium">Directory Active</p>
                                                    <p className="text-[11px] text-telegram-subtext mt-0.5">{rootName} location loaded</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 relative z-10">
                                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                </div>
                                                <div className="text-xs">
                                                    <p className="text-telegram-text font-medium">Security Protocol</p>
                                                    <p className="text-[11px] text-telegram-subtext mt-0.5">MTProto Encrypted Connection</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : totalSelected > 1 ? (
                /* Multi Selection State */
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-6">
                    <div className="flex flex-col items-center py-6 border-b border-telegram-border/50">
                        <div className="w-16 h-16 bg-telegram-hover rounded-xl flex items-center justify-center mb-3">
                            <File className="w-8 h-8 text-telegram-subtext" />
                        </div>
                        <span className="font-semibold text-telegram-text text-center text-sm">
                            {totalSelected} items selected
                        </span>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Properties</h4>
                        <div className="grid grid-cols-3 gap-y-2 text-xs">
                            <span className="text-telegram-subtext col-span-1">Files:</span>
                            <span className="text-telegram-text col-span-2">{selectedFiles.length}</span>

                            <span className="text-telegram-subtext col-span-1">Folders:</span>
                            <span className="text-telegram-text col-span-2">{selectedFolders.length}</span>

                            <span className="text-telegram-subtext col-span-1">Total Size:</span>
                            <span className="text-telegram-text col-span-2">
                                {formatBytes(selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0))}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                /* Single Selection State */
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-telegram-border text-xs">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                                activeTab === 'details'
                                    ? 'border-telegram-primary text-telegram-primary'
                                    : 'border-transparent text-telegram-subtext hover:text-telegram-text'
                            }`}
                        >
                            Details
                        </button>
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={`flex-1 py-3 text-center font-medium border-b-2 transition-all ${
                                activeTab === 'activity'
                                    ? 'border-telegram-primary text-telegram-primary'
                                    : 'border-transparent text-telegram-subtext hover:text-telegram-text'
                            }`}
                        >
                            Activity
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {selectedFiles.length === 1 ? (
                            /* Render File Details */
                            (() => {
                                const file = selectedFiles[0];
                                const isFileStarred = isStarred(file.id);
                                return (
                                    <>
                                        {/* Large Thumbnail / Icon Container */}
                                        <div className="w-full h-36 bg-telegram-hover/50 border border-telegram-border/50 rounded-xl flex items-center justify-center relative overflow-hidden group">
                                            <FileTypeIcon filename={file.name} size="lg" className="w-16 h-16 text-telegram-subtext/60" />
                                            <button
                                                onClick={() => isFileStarred ? unstarFile(file.id) : starFile(file)}
                                                className="absolute top-2 right-2 p-1.5 rounded-full bg-telegram-surface/80 border border-telegram-border/50 text-amber-400 hover:scale-110 transition-transform"
                                                title={isFileStarred ? "Remove Star" : "Add Star"}
                                            >
                                                <Star className="w-4 h-4" fill={isFileStarred ? "currentColor" : "none"} />
                                            </button>
                                        </div>

                                        {/* File Metadata Properties */}
                                        <div className="space-y-4">
                                            <div className="flex items-start justify-between">
                                                <h3 className="font-semibold text-telegram-text text-sm break-all pr-4">{file.name}</h3>
                                            </div>

                                            {activeTab === 'details' ? (
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Properties</h4>
                                                    <div className="grid grid-cols-3 gap-y-3.5 text-xs border-b border-telegram-border/30 pb-4">
                                                        <span className="text-telegram-subtext col-span-1">Type:</span>
                                                        <span className="text-telegram-text col-span-2 truncate">{(file.name || '').split('.').pop()?.toUpperCase() || 'Unknown'} File</span>

                                                        <span className="text-telegram-subtext col-span-1">Size:</span>
                                                        <span className="text-telegram-text col-span-2">{file.sizeStr || formatBytes(file.size)}</span>

                                                        <span className="text-telegram-subtext col-span-1">Location:</span>
                                                        <span className="text-telegram-text col-span-2 truncate">{getFolderName(file.folder_id ?? activeFolderId)}</span>

                                                        <span className="text-telegram-subtext col-span-1">Created:</span>
                                                        <span className="text-telegram-text col-span-2 font-mono">
                                                            {formatDate(file.created_at)}
                                                        </span>

                                                        <span className="text-telegram-subtext col-span-1">Message ID:</span>
                                                        <span className="text-telegram-text col-span-2 font-mono">{file.id}</span>
                                                    </div>

                                                    {/* Quick Actions */}
                                                    <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider pt-2">Quick Actions</h4>
                                                    {currentTab === 'trash' ? (
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    restoreFile(file.id);
                                                                    toast.success(`Restored "${file.name}"`);
                                                                }}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs transition-colors cursor-pointer w-full"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                                Restore File
                                                            </button>
                                                            <button
                                                                onClick={() => onDelete(file)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors cursor-pointer w-full"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete Permanently
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => onDownload(file)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors cursor-pointer"
                                                            >
                                                                <Download className="w-3.5 h-3.5" />
                                                                Download
                                                            </button>

                                                            <button
                                                                onClick={() => onRename(file)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors cursor-pointer"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                                Rename
                                                            </button>
                                                            <button
                                                                onClick={() => onMove(file)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors cursor-pointer"
                                                            >
                                                                <FolderInput className="w-3.5 h-3.5" />
                                                                Move
                                                            </button>
                                                            <button
                                                                onClick={() => onDelete(file)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs col-span-2 transition-colors cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Move to Trash
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Activity Feed */
                                                <div className="space-y-4 relative before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-telegram-border/40">
                                                    <div className="flex gap-3 relative z-10">
                                                        <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className="text-telegram-text font-medium">Uploaded to Telegram</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                                {formatDate(file.created_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 relative z-10">
                                                        <div className="w-4 h-4 rounded-full bg-telegram-primary/20 border border-telegram-primary/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-telegram-primary" />
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className="text-telegram-text font-medium">Indexed in Drive</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                                Message ID #{file.id} • {file.sizeStr || formatBytes(file.size)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 relative z-10">
                                                        <div className="w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className="text-telegram-text font-medium">Star Status</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                                {isFileStarred ? 'Starred in your drive' : 'Unstarred'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()
                        ) : (
                            /* Render Folder Details */
                            (() => {
                                const folder = selectedFolders[0];
                                return (
                                    <>
                                        <div className="w-full h-32 bg-telegram-hover/30 border border-telegram-border/50 rounded-xl flex items-center justify-center">
                                            <Folder className="w-14 h-14 text-telegram-primary/80" />
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="font-semibold text-telegram-text text-sm break-all">{folder.name}</h3>

                                            {activeTab === 'details' ? (
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Properties</h4>
                                                    <div className="grid grid-cols-3 gap-y-3.5 text-xs border-b border-telegram-border/30 pb-4">
                                                        <span className="text-telegram-subtext col-span-1">Type:</span>
                                                        <span className="text-telegram-text col-span-2">Folder Channel</span>

                                                        <span className="text-telegram-subtext col-span-1">Visibility:</span>
                                                        <span className="text-telegram-text col-span-2">
                                                            {folder.is_public || folder.username ? 'Public' : 'Private'}
                                                        </span>

                                                        <span className="text-telegram-subtext col-span-1">Channel ID:</span>
                                                        <span className="text-telegram-text col-span-2 font-mono truncate">{folder.id}</span>
                                                    </div>

                                                    <FolderMembersSection folderId={folder.id} />

                                                    <h4 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider pt-2">Quick Actions</h4>
                                                    {currentTab === 'trash' ? (
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    restoreFolder(folder.id);
                                                                    toast.success(`Restored folder "${folder.name}"`);
                                                                }}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs transition-colors cursor-pointer w-full"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                                Restore Folder
                                                            </button>
                                                            <button
                                                                onClick={() => onDelete({ id: folder.id, name: folder.name } as any)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors cursor-pointer w-full"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete Permanently
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                onClick={() => isFolderStarred(folder.id) ? unstarFolder(folder.id) : starFolder(folder)}
                                                                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors w-full"
                                                            >
                                                                <Star className={`w-3.5 h-3.5 ${isFolderStarred(folder.id) ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}`} />
                                                                {isFolderStarred(folder.id) ? 'Remove from Starred' : 'Add to Starred'}
                                                            </button>
                                                            {onFolderRename && !(folder.id === -999 || folder.name === 'Saved Messages') && (
                                                                <button
                                                                    onClick={() => onFolderRename(folder.id, folder.name)}
                                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-telegram-hover text-telegram-text rounded-lg text-xs hover:bg-white/10 transition-colors w-full"
                                                                >
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                    Rename Folder
                                                                </button>
                                                            )}
                                                            {onFolderDelete && !(folder.id === -999 || folder.name === 'Saved Messages') && (
                                                                <button
                                                                    onClick={() => onFolderDelete(folder.id, folder.name)}
                                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors w-full"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                    Delete Folder
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Activity Feed */
                                                <div className="space-y-4 relative before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-telegram-border/40">
                                                    <div className="flex gap-3 relative z-10">
                                                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className="text-telegram-text font-medium">Folder Mapped</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">Channel ID: {folder.id}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 relative z-10">
                                                        <div className="w-4 h-4 rounded-full bg-telegram-primary/20 border border-telegram-primary/50 flex items-center justify-center shrink-0 mt-0.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-telegram-primary" />
                                                        </div>
                                                        <div className="text-xs">
                                                            <p className="text-telegram-text font-medium">Access Rights</p>
                                                            <p className="text-[11px] text-telegram-subtext mt-0.5">
                                                                {folder.is_public || folder.username ? 'Public Channel' : 'Private Channel'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()
                        )}
                    </div>
                </div>
            )}
        </aside>
    );
}
