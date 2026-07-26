import { useState, useRef, useEffect } from 'react';
import { Plus, Link, CheckCircle2 } from 'lucide-react';
import { MyDriveIcon, SharedIcon, RecentIcon, StarredIcon, TrashIcon, StorageIcon, BandwidthIcon, FolderIcon } from '../../shared/DriveIcons';
import { BandwidthWidget } from './BandwidthWidget';
import { TelegramFolder, BandwidthStats } from '../../../types';
import { useDrive } from '../../../context/DriveContext';
import { formatBytes } from '../../../utils';

interface SidebarProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    setActiveFolderId: (id: number | null) => void;
    onDrop: (e: React.DragEvent, folderId: number | null) => void;
    onDelete: (id: number, name: string) => void;
    onRename: (id: number, name: string) => void;
    onToggleVisibility: (id: number, name: string, isPublic: boolean) => void;
    onExportInvite: (id: number, name: string) => void;
    onCreate: (name: string) => Promise<void>;
    isSyncing: boolean;
    isConnected: boolean;
    onSync: () => void;
    onLogout: () => void;
    bandwidth: BandwidthStats | null;
    onReorderFolders: (reordered: TelegramFolder[]) => Promise<void>;
    onManualUpload: () => void;
    onFolderUpload: () => void;
    onRemoteUploadClick: () => void;
    onNewFolderRequest: () => void;
    totalStorageSize?: number;
}

const navItemBase = 'group w-full flex items-center gap-3 px-3 pr-4 py-2.5 transition-all duration-150 cursor-pointer rounded-r-full';
const navItemActive = 'bg-telegram-primary/10 text-telegram-primary font-semibold';
const navItemIdle = 'text-telegram-text/75 hover:bg-telegram-hover hover:text-telegram-text font-medium';

export function Sidebar({
    folders: _folders, activeFolderId: _activeFolderId, setActiveFolderId, onDrop: _onDrop, onDelete: _onDelete, onRename: _onRename, onToggleVisibility: _onToggleVisibility, onExportInvite: _onExportInvite, onCreate: _onCreate,
    isSyncing: _isSyncing, isConnected: _isConnected, onSync: _onSync, onLogout: _onLogout, bandwidth,
    onReorderFolders: _onReorderFolders, onManualUpload, onFolderUpload, onRemoteUploadClick, onNewFolderRequest,
    totalStorageSize = 0
}: SidebarProps) {
    const { currentTab, setCurrentTab } = useDrive();
    const [showNewDropdown, setShowNewDropdown] = useState(false);
    const newDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showNewDropdown) return;
        const handler = () => setShowNewDropdown(false);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [showNewDropdown]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowNewDropdown(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    return (
        <aside className="w-60 bg-transparent flex flex-col h-full z-10 flex-shrink-0">
            {/* + New Button */}
            <div className="px-3 pt-4 pb-3 relative" ref={newDropdownRef}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowNewDropdown(!showNewDropdown);
                    }}
                    className="flex items-center gap-3 px-5 py-3 bg-telegram-hover hover:bg-telegram-hover/80 text-telegram-text font-semibold text-sm rounded-full shadow-md border border-telegram-border/40 hover:shadow-lg transition-all cursor-pointer"
                >
                    <Plus className="w-5 h-5 text-telegram-primary" />
                    <span>New</span>
                </button>

                {showNewDropdown && (
                    <div className="absolute top-[68px] left-3 w-52 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        <button
                            onClick={() => { setShowNewDropdown(false); onNewFolderRequest(); }}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-lg text-left transition-colors w-full cursor-pointer"
                        >
                            <Plus className="w-4 h-4 text-telegram-primary" />
                            New Folder
                        </button>
                        <div className="h-px bg-telegram-border/50 my-1" />
                        <button
                            onClick={() => { setShowNewDropdown(false); onManualUpload(); }}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-lg text-left transition-colors w-full cursor-pointer"
                        >
                            <FolderIcon className="w-4 h-4" />
                            File upload
                        </button>
                        <button
                            onClick={() => { setShowNewDropdown(false); onFolderUpload(); }}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-lg text-left transition-colors w-full cursor-pointer"
                        >
                            <FolderIcon className="w-4 h-4" />
                            Folder upload (ZIP)
                        </button>
                        <button
                            onClick={() => { setShowNewDropdown(false); onRemoteUploadClick(); }}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-lg text-left transition-colors w-full cursor-pointer"
                        >
                            <Link className="w-4 h-4 text-purple-400" />
                            Remote URL upload
                        </button>

                    </div>
                )}
            </div>



            {/* Nav Items */}
            <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto min-h-0 custom-scrollbar select-none">

                    <div
                        onClick={() => { setCurrentTab('my-drive'); setActiveFolderId(null); }}
                        className={`${navItemBase} ${currentTab === 'my-drive' ? navItemActive : navItemIdle}`}
                    >
                        <MyDriveIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate text-sm">My Drive</span>
                    </div>

                    <div
                        onClick={() => {
                            setCurrentTab('shared');
                            // Keep the root selected so File Explorer can show every
                            // incoming folder instead of silently opening the first one.
                            setActiveFolderId(null);
                        }}
                        className={`${navItemBase} ${currentTab === 'shared' ? navItemActive : navItemIdle}`}
                    >
                        <SharedIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate text-sm">Shared with me</span>
                    </div>

                    <div
                        onClick={() => setCurrentTab('recent')}
                        className={`${navItemBase} ${currentTab === 'recent' ? navItemActive : navItemIdle}`}
                    >
                        <RecentIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate text-sm">Recent</span>
                    </div>

                    <div
                        onClick={() => setCurrentTab('starred')}
                        className={`${navItemBase} ${currentTab === 'starred' ? navItemActive : navItemIdle}`}
                    >
                        <StarredIcon className="w-5 h-5 flex-shrink-0" filled={currentTab === 'starred'} />
                        <span className="flex-1 text-left truncate text-sm">Starred</span>
                    </div>

                    <div
                        onClick={() => setCurrentTab('offline')}
                        className={`${navItemBase} ${currentTab === 'offline' ? navItemActive : navItemIdle}`}
                    >
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate text-sm">Offline</span>
                    </div>

                    <div
                        onClick={() => setCurrentTab('trash')}
                        className={`${navItemBase} ${currentTab === 'trash' ? navItemActive : navItemIdle}`}
                    >
                        <TrashIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate text-sm">Trash</span>
                    </div>

                    {/* Storage & Bandwidth */}
                    <div className="pt-2 mt-1 border-t border-telegram-border/20 space-y-1">
                        <div className={`${navItemBase} text-telegram-text/75 cursor-default hover:bg-transparent py-2 flex flex-col items-start gap-1`}>
                            <div className="flex items-center gap-3 w-full">
                                <StorageIcon className="w-5 h-5 flex-shrink-0" />
                                <div className="flex-1 flex items-center justify-between text-sm">
                                    <span className="font-medium text-telegram-text">Storage</span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-telegram-primary/10 text-telegram-primary">Unlimited</span>
                                </div>
                            </div>
                            <div className="pl-8 text-[11px] text-telegram-subtext/80 font-normal">
                                {formatBytes(totalStorageSize)} used
                            </div>
                        </div>
                        {bandwidth && (
                            <div className="space-y-1 pb-2">
                                <div className={`${navItemBase} text-telegram-text/75 cursor-default hover:bg-transparent py-1.5`}>
                                    <BandwidthIcon className="w-5 h-5 flex-shrink-0" />
                                    <span className="flex-1 text-left truncate text-sm font-medium text-telegram-text">Daily Bandwidth</span>
                                </div>
                                <BandwidthWidget bandwidth={bandwidth} />
                            </div>
                        )}
                    </div>
                </nav>
        </aside>
    );
}
