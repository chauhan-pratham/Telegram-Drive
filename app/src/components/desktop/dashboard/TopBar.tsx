import { LayoutGrid, LayoutList, Share2, X, Info, ChevronRight, Download, Trash2, FolderInput, ChevronDown, RefreshCw, ArrowUpDown, RotateCcw, Pencil, Star, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../context/SettingsContext';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef } from 'react';
import { useDrive, FileTypeFilter } from '../../../context/DriveContext';
import { toast } from 'sonner';
import { TelegramFile } from '../../../types';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    onShowMoveModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onBulkShare: () => void;
    onDownloadFolder: () => void;
    onClearSelection: () => void;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    onRemoteUploadClick: () => void;
    onGoToRoot?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onBulkRestore?: () => void;
    folders: { id: number; name: string }[];
    activeFolderId: number | null;
    onExportInvite?: (id: number, name: string) => void;
    onFolderRename?: (id: number, name: string) => void;
    onDownloadFolderById?: (id: number, name: string) => void;
    files?: TelegramFile[];
}

export function TopBar({
    currentFolderName, selectedIds, onShowMoveModal, onBulkDownload, onBulkDelete, onBulkShare,
    onDownloadFolder: _onDownloadFolder, onClearSelection, viewMode, setViewMode, onRemoteUploadClick: _onRemoteUploadClick, onGoToRoot,
    onRefresh, isRefreshing, onBulkRestore, folders, activeFolderId: _activeFolderId, onExportInvite, onFolderRename, onDownloadFolderById, files
}: TopBarProps) {
    const { t } = useTranslation();
    const { settings } = useSettings();
    const {
        isInfoPanelOpen,
        setIsInfoPanelOpen,
        fileTypeFilter,
        setFileTypeFilter,
        setCurrentTab,
        currentTab,
        sortField,
        setSortField,
        sortDirection,
        setSortDirection,
        isStarred,
        starFile,
        unstarFile,
        isFolderStarred,
        starFolder,
        unstarFolder,
        removeOfflineAccess,
        offlineFiles,
        starredFiles,
        trashedFiles,
    } = useDrive();

    const [proxyStatus, setProxyStatus] = useState<{ reachable: boolean; latency_ms: number } | null>(null);
    const [localRefreshing, setLocalRefreshing] = useState(false);

    const handleRefreshClick = async () => {
        setLocalRefreshing(true);
        const startTime = Date.now();
        try {
            if (onRefresh) {
                await onRefresh();
            }
        } catch (e) {
            console.error(e);
        } finally {
            const elapsed = Date.now() - startTime;
            const delay = Math.max(0, 800 - elapsed);
            setTimeout(() => {
                setLocalRefreshing(false);
            }, delay);
        }
    };

    const isSpinning = !!isRefreshing || localRefreshing;

    // Poll proxy status
    useEffect(() => {
        if (!settings.proxyEnabled || !settings.proxyLiveStateEnabled) {
            setProxyStatus(null);
            return;
        }
        const checkProxy = async () => {
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
    }, [settings.proxyEnabled, settings.proxyLiveStateEnabled]);

    const tabLabel: Record<string, string> = {
        'my-drive': 'My Drive',
        'shared': 'Shared with me',
        'recent': 'Recent',
        'starred': 'Starred',
        'trash': 'Trash',
        'offline': 'Offline',
    };
    const isMyDrive = currentTab === 'my-drive';
    const [showFilters, setShowFilters] = useState(false);
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showFilters) return;
        const handler = (e: MouseEvent) => {
            if (filterMenuRef.current && filterMenuRef.current.contains(e.target as Node)) return;
            setShowFilters(false);
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showFilters]);

    useEffect(() => {
        if (!showSortMenu) return;
        const handler = (e: MouseEvent) => {
            if (sortMenuRef.current && sortMenuRef.current.contains(e.target as Node)) return;
            setShowSortMenu(false);
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showSortMenu]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowFilters(false);
                setShowSortMenu(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getFilterLabel = (filter: FileTypeFilter) => {
        switch (filter) {
            case 'pdf': return 'PDFs';
            case 'image': return 'Images';
            case 'video': return 'Videos';
            case 'audio': return 'Audio';
            case 'archive': return 'Archives';
            case 'document': return 'Documents';
            default: return 'Type';
        }
    };

    return (
        <div className="flex flex-col border-b border-telegram-border/40 bg-telegram-surface select-none z-10">
            {/* Top Toolbar Row */}
            <header className="h-14 flex items-center px-6 justify-between">
                {/* Header title — tab-aware */}
                <div className="flex-1 flex items-center justify-start gap-4">
                    <div className="flex items-center text-base text-telegram-text select-none font-medium">
                        {isMyDrive ? (
                            <>
                                {/* My Drive root or folder breadcrumb */}
                                <span
                                    onClick={() => { if (onGoToRoot) onGoToRoot(); setCurrentTab('my-drive'); }}
                                    className={`transition-colors ${
                                        !currentFolderName
                                            ? 'font-semibold cursor-default'
                                            : 'hover:text-telegram-primary cursor-pointer'
                                    }`}
                                >
                                    My Drive
                                </span>
                                {currentFolderName && (
                                    <>
                                        <ChevronRight className="w-4 h-4 mx-1.5 text-telegram-subtext" />
                                        <span className="text-telegram-text font-semibold">{currentFolderName}</span>
                                    </>
                                )}
                            </>
                        ) : (
                            /* Non-my-drive tabs: just show the section name, no breadcrumb prefix */
                            <span className="font-semibold">{tabLabel[currentTab] ?? (currentTab.charAt(0).toUpperCase() + currentTab.slice(1))}</span>
                        )}
                    </div>
                </div>

                {/* Right side controls / Selected actions */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 mr-2">
                        {/* Proxy status */}
                        {settings.proxyEnabled && settings.proxyLiveStateEnabled && (
                            <div 
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-telegram-hover/40 border border-telegram-border/30 text-[10px] text-telegram-subtext font-mono transition-all cursor-help"
                                title={!proxyStatus ? 'Checking proxy…' : proxyStatus.reachable ? `${proxyStatus.latency_ms}ms latency` : 'Proxy offline'}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${!proxyStatus ? 'bg-amber-400 animate-pulse' : proxyStatus.reachable ? 'bg-green-400 shadow' : 'bg-red-500 shadow'}`} />
                                <span>{!proxyStatus ? 'Checking' : proxyStatus.reachable ? `${proxyStatus.latency_ms}ms` : 'Offline'}</span>
                            </div>
                        )}
                    </div>

                    {/* Refresh button */}
                    {onRefresh && (
                        <button
                            onClick={handleRefreshClick}
                            className="p-2 hover:bg-telegram-hover rounded-full text-telegram-subtext hover:text-telegram-text transition-colors relative group"
                            title="Refresh folder files"
                            disabled={isSpinning}
                        >
                            <RefreshCw className={`w-4.5 h-4.5 ${isSpinning ? 'animate-spin' : ''}`} />
                        </button>
                    )}

                    {/* Layout switch */}
                    <button
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="p-2 hover:bg-telegram-hover rounded-full text-telegram-subtext hover:text-telegram-text transition-colors relative group"
                        title={t('files.toggle_layout')}
                    >
                        {viewMode === 'grid' ? <LayoutList className="w-4.5 h-4.5" /> : <LayoutGrid className="w-4.5 h-4.5" />}
                    </button>

                    {/* Details toggler */}
                    <button
                        onClick={() => setIsInfoPanelOpen(!isInfoPanelOpen)}
                        className={`p-2 rounded-full transition-colors relative group ${
                            isInfoPanelOpen
                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                        }`}
                        title="View details"
                    >
                        <Info className="w-4.5 h-4.5" />
                    </button>
                </div>
            </header>

            {/* Google Drive styled Chips Row */}
            <div className="flex items-center flex-wrap gap-2 px-6 pb-3 pt-1.5 select-none min-h-[38px]">
                {selectedIds.length > 0 ? (
                    <div className="flex items-center gap-2 animate-in fade-in duration-200 w-full">
                        <span className="text-xs text-telegram-text font-semibold mr-2">{t('files.items_selected', { count: selectedIds.length })}</span>
                        
                        <button
                            onClick={onClearSelection}
                            className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer"
                            title={t('files.clear_selection')}
                        >
                            <X className="w-3.5 h-3.5 text-telegram-subtext" />
                            <span>Clear</span>
                        </button>

                        {(() => {
                            const allKnownFilesMap = new Map<number, TelegramFile>();
                            (files || []).forEach(f => allKnownFilesMap.set(f.id, f));
                            (offlineFiles || []).forEach(f => allKnownFilesMap.set(f.id, f));
                            (starredFiles || []).forEach(f => allKnownFilesMap.set(f.id, f));
                            (trashedFiles || []).forEach(f => allKnownFilesMap.set(f.id, f));

                            const selectedFileItems = selectedIds.map(id => allKnownFilesMap.get(id)).filter((f): f is TelegramFile => !!f);
                            const selectedFolderItems = folders?.filter(f => selectedIds.includes(f.id)) || [];

                            const hasSelectedFiles = selectedFileItems.length > 0;
                            const hasSelectedFolders = selectedFolderItems.length > 0;

                            const allFilesStarred = hasSelectedFiles && selectedFileItems.every(f => isStarred(f.id));
                            const allFoldersStarred = hasSelectedFolders && selectedFolderItems.every(f => isFolderStarred(f.id));

                            const isAllSelectedStarred = (hasSelectedFiles || hasSelectedFolders) &&
                                (!hasSelectedFiles || allFilesStarred) &&
                                (!hasSelectedFolders || allFoldersStarred);

                            const handleToggleStarSelection = () => {
                                if (isAllSelectedStarred) {
                                    selectedIds.forEach(id => unstarFile(id));
                                    selectedFolderItems.forEach(f => unstarFolder(f.id));
                                    toast.success(`Removed ${selectedIds.length} item(s) from Starred`);
                                } else {
                                    selectedFileItems.forEach(f => starFile(f));
                                    selectedFolderItems.forEach(f => {
                                        starFolder({ id: f.id, name: f.name } as any);
                                    });
                                    toast.success(`Added ${selectedIds.length} item(s) to Starred`);
                                }
                            };

                            return (
                                <button
                                    onClick={handleToggleStarSelection}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                    title={isAllSelectedStarred ? "Remove from Starred" : "Add to Starred"}
                                >
                                    <Star className={`w-3.5 h-3.5 text-amber-400 ${isAllSelectedStarred ? 'fill-amber-400' : ''}`} />
                                    <span>{isAllSelectedStarred ? 'Unstar' : 'Star'}</span>
                                </button>
                            );
                        })()}

                        {currentTab === 'trash' ? (
                            <>
                                {onBulkRestore && (
                                    <button
                                        onClick={onBulkRestore}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                        title="Restore selected items"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5 text-telegram-primary" />
                                        <span>Restore</span>
                                    </button>
                                )}

                                <button
                                    onClick={onBulkDelete}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs rounded-full border border-red-500/20 transition-colors cursor-pointer font-medium"
                                    title="Delete selected items forever"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete Forever</span>
                                </button>
                            </>
                        ) : (
                            <>
                                {/* Folder specific actions (Get Link / Rename) when a single folder is selected */}
                                {selectedIds.length === 1 && folders.some(f => f.id === selectedIds[0]) && (
                                    <>
                                        {onExportInvite && (() => {
                                            const folder = folders.find(f => f.id === selectedIds[0]);
                                            return folder && (
                                                <button
                                                    onClick={() => onExportInvite(folder.id, folder.name)}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                                    title="Get invite link"
                                                >
                                                    <Share2 className="w-3.5 h-3.5 text-telegram-primary" />
                                                    <span>Get Link</span>
                                                </button>
                                            );
                                        })()}

                                        {onFolderRename && (() => {
                                            const folder = folders.find(f => f.id === selectedIds[0]);
                                            return folder && (
                                                <button
                                                    onClick={() => onFolderRename(folder.id, folder.name)}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                                    title="Rename folder"
                                                >
                                                    <Pencil className="w-3.5 h-3.5 text-blue-400" />
                                                    <span>Rename</span>
                                                </button>
                                            );
                                        })()}

                                        {onDownloadFolderById && (() => {
                                            const folder = folders.find(f => f.id === selectedIds[0]);
                                            return folder && (
                                                <button
                                                    onClick={() => onDownloadFolderById(folder.id, folder.name)}
                                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                                    title="Download folder"
                                                >
                                                    <Download className="w-3.5 h-3.5 text-green-400" />
                                                    <span>Download</span>
                                                </button>
                                            );
                                        })()}
                                    </>
                                )}

                                {currentTab === 'offline' && (
                                    <button
                                        onClick={() => {
                                            selectedIds.forEach(id => removeOfflineAccess(id));
                                            toast.success(`Removed offline access for ${selectedIds.length} item(s)`);
                                            onClearSelection();
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                        title="Remove offline access for selected items"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                                        <span>Remove Offline</span>
                                    </button>
                                )}

                                {currentTab !== 'offline' && !selectedIds.some(id => folders.some(f => f.id === id)) && (
                                    <button
                                        onClick={onShowMoveModal}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer"
                                        title={t('files.move_to')}
                                    >
                                        <FolderInput className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Move</span>
                                    </button>
                                )}

                                {!selectedIds.some(id => folders.some(f => f.id === id)) && (
                                    <button
                                        onClick={onBulkDownload}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer"
                                        title={t('files.download_selected')}
                                    >
                                        <Download className="w-3.5 h-3.5 text-green-400" />
                                        <span>Download</span>
                                    </button>
                                )}

                                {currentTab !== 'offline' && !selectedIds.some(id => folders.some(f => f.id === id)) && (
                                    <button
                                        onClick={onBulkShare}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer"
                                        title={t('files.share')}
                                    >
                                        <Share2 className="w-3.5 h-3.5 text-telegram-primary" />
                                        <span>Share</span>
                                    </button>
                                )}

                                <button
                                    onClick={onBulkDelete}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs rounded-full border border-red-500/20 transition-colors cursor-pointer font-medium"
                                    title={t('files.delete')}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Type Filter Chip */}
                        <div className="relative" ref={filterMenuRef}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowFilters(!showFilters);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 shrink-0 transition-colors cursor-pointer ${
                                    fileTypeFilter !== 'all' ? 'border-telegram-primary/30 text-telegram-primary bg-telegram-primary/5 font-semibold' : ''
                                }`}
                            >
                                <span>{getFilterLabel(fileTypeFilter)}</span>
                                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                            </button>

                            {showFilters && (
                                <div className="absolute top-8 left-0 w-44 bg-telegram-surface border border-telegram-border rounded-xl shadow-xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in duration-100">
                                    {(['all', 'pdf', 'image', 'video', 'audio', 'archive', 'document'] as FileTypeFilter[]).map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => {
                                                setFileTypeFilter(f);
                                                setShowFilters(false);
                                            }}
                                            className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                                fileTypeFilter === f
                                                    ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                    : 'text-telegram-text hover:bg-telegram-hover'
                                            }`}
                                        >
                                            {f === 'all' ? 'All files' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sort Dropdown Chip */}
                        <div className="relative" ref={sortMenuRef}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSortMenu(!showSortMenu);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 shrink-0 transition-colors cursor-pointer`}
                            >
                                <ArrowUpDown className="w-3.5 h-3.5 text-telegram-primary" />
                                <span>
                                    Sort by: {sortField === 'date' ? 'Date' : sortField === 'name' ? 'Name' : 'Size'}
                                    {' '}
                                    ({sortDirection === 'asc' ? 'Oldest first' : 'Newest first'})
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                            </button>

                            {showSortMenu && (
                                <div className="absolute top-8 left-0 w-44 bg-telegram-surface border border-telegram-border rounded-xl shadow-xl p-1 z-50 flex flex-col gap-0.5 animate-in fade-in duration-100">
                                    <button
                                        onClick={() => {
                                            setSortField('date');
                                            setSortDirection('desc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'date' && sortDirection === 'desc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Date: Newest first
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortField('date');
                                            setSortDirection('asc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'date' && sortDirection === 'asc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Date: Oldest first
                                    </button>
                                    <div className="h-px bg-telegram-border my-1 mx-1" />
                                    <button
                                        onClick={() => {
                                            setSortField('name');
                                            setSortDirection('asc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'name' && sortDirection === 'asc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Name: A-Z
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortField('name');
                                            setSortDirection('desc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'name' && sortDirection === 'desc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Name: Z-A
                                    </button>
                                    <div className="h-px bg-telegram-border my-1 mx-1" />
                                    <button
                                        onClick={() => {
                                            setSortField('size');
                                            setSortDirection('desc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'size' && sortDirection === 'desc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Size: Largest first
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortField('size');
                                            setSortDirection('asc');
                                            setShowSortMenu(false);
                                        }}
                                        className={`px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors ${
                                            sortField === 'size' && sortDirection === 'asc'
                                                ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        Size: Smallest first
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
