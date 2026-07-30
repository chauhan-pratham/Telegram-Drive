import { LayoutGrid, LayoutList, Share2, X, Info, ChevronRight, Download, Trash2, FolderInput, ChevronDown, RefreshCw, ArrowUpDown, RotateCcw, Pencil, Star, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useDrive, FileTypeFilter } from '../../../context/DriveContext';
import { toast } from 'sonner';
import { TelegramFile } from '../../../types';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    onShowMoveModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    onClearSelection: () => void;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    onGoToRoot?: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onBulkRestore?: () => void;
    folders: { id: number; name: string; parent_id?: number | null }[];
    activeFolderId: number | null;
    onExportInvite?: (id: number, name: string) => void;
    onFolderRename?: (id: number, name: string) => void;
    onDownloadFolderById?: (id: number, name: string) => void;
    files?: TelegramFile[];
    onNavigateToFolder?: (folderId: number | null) => void;
}

export function TopBar({
    currentFolderName,
    selectedIds,
    onShowMoveModal,
    onBulkDownload,
    onBulkDelete,
    onDownloadFolder: _onDownloadFolder,
    onClearSelection,
    viewMode,
    setViewMode,
    onGoToRoot,
    onRefresh,
    isRefreshing,
    onBulkRestore,
    folders,
    activeFolderId: _activeFolderId,
    onExportInvite,
    onFolderRename,
    onDownloadFolderById,
    files,
    onNavigateToFolder,
}: TopBarProps) {
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

    const breadcrumbs = useMemo(() => {
        if (currentTab !== 'my-drive' || !_activeFolderId) return [];
        const chain: { id: number; name: string }[] = [];
        let currId: number | null | undefined = _activeFolderId;
        const visited = new Set<number>();
        while (currId && !visited.has(currId)) {
            visited.add(currId);
            const found = (folders as any[]).find(f => f.id === currId);
            if (found) {
                chain.unshift({ id: found.id, name: found.name });
                currId = found.parent_id ?? null;
            } else {
                break;
            }
        }
        return chain;
    }, [currentTab, _activeFolderId, folders]);

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
    const [showSelectionMoreMenu, setShowSelectionMoreMenu] = useState(false);
    const selectionMoreMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showSelectionMoreMenu) return;
        const handler = (e: MouseEvent) => {
            if (selectionMoreMenuRef.current && selectionMoreMenuRef.current.contains(e.target as Node)) return;
            setShowSelectionMoreMenu(false);
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showSelectionMoreMenu]);

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
                                        breadcrumbs.length === 0
                                            ? 'font-semibold cursor-default text-telegram-text'
                                            : 'hover:text-telegram-primary cursor-pointer text-telegram-subtext'
                                    }`}
                                >
                                    My Drive
                                </span>
                                {breadcrumbs.map((item, idx) => {
                                    const isLast = idx === breadcrumbs.length - 1;
                                    return (
                                        <div key={item.id} className="flex items-center">
                                            <ChevronRight className="w-4 h-4 mx-1.5 text-telegram-subtext shrink-0" />
                                            <span
                                                onClick={() => {
                                                    if (!isLast && onNavigateToFolder) {
                                                        onNavigateToFolder(item.id);
                                                    }
                                                }}
                                                className={`transition-colors truncate max-w-[160px] ${
                                                    isLast
                                                        ? 'font-semibold text-telegram-text cursor-default'
                                                        : 'hover:text-telegram-primary cursor-pointer text-telegram-subtext'
                                                }`}
                                            >
                                                {item.name}
                                            </span>
                                        </div>
                                    );
                                })}
                                {breadcrumbs.length === 0 && currentFolderName && (
                                    <>
                                        <ChevronRight className="w-4 h-4 mx-1.5 text-telegram-subtext shrink-0" />
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
                        title="Toggle layout"
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
                        <span className="text-xs text-telegram-text font-semibold mr-2">{selectedIds.length} selected</span>
                        
                        <button
                            onClick={onClearSelection}
                            className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer"
                            title="Clear selection"
                        >
                            <X className="w-3.5 h-3.5 text-telegram-subtext" />
                            <span>Clear</span>
                        </button>

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
                                {/* Primary Action 1: Download */}
                                <button
                                    onClick={() => {
                                        const selectedFolder = selectedIds.length === 1 ? folders.find(f => f.id === selectedIds[0]) : null;
                                        if (selectedFolder && onDownloadFolderById) {
                                            onDownloadFolderById(selectedFolder.id, selectedFolder.name);
                                        } else {
                                            onBulkDownload();
                                        }
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                    title="Download selected"
                                >
                                    <Download className="w-3.5 h-3.5 text-green-400" />
                                    <span>Download</span>
                                </button>

                                {/* Primary Action 2: Move */}
                                <button
                                    onClick={onShowMoveModal}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text text-xs rounded-full border border-telegram-border/30 transition-colors cursor-pointer font-medium"
                                    title="Move to folder"
                                >
                                    <FolderInput className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Move</span>
                                </button>

                                {/* Primary Action 3: Delete */}
                                <button
                                    onClick={onBulkDelete}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs rounded-full border border-red-500/20 transition-colors cursor-pointer font-medium"
                                    title="Delete selected"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                </button>

                                {/* More Actions Dropdown Menu (...) */}
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
                                        setShowSelectionMoreMenu(false);
                                    };

                                    return (
                                        <div className="relative" ref={selectionMoreMenuRef}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowSelectionMoreMenu(!showSelectionMoreMenu);
                                                }}
                                                className={`flex items-center justify-center p-1.5 rounded-full border transition-colors cursor-pointer ${
                                                    showSelectionMoreMenu
                                                        ? 'bg-telegram-primary/20 border-telegram-primary/40 text-telegram-primary'
                                                        : 'bg-telegram-hover hover:bg-telegram-border/60 text-telegram-text border-telegram-border/30'
                                                }`}
                                                title="More actions"
                                            >
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>

                                            {showSelectionMoreMenu && (
                                                <div className="absolute right-0 mt-2 w-48 bg-telegram-surface border border-telegram-border rounded-xl shadow-xl z-50 py-1 text-xs animate-in fade-in duration-100">
                                                    {/* Star / Unstar Option */}
                                                    <button
                                                        onClick={handleToggleStarSelection}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-telegram-text hover:bg-telegram-hover transition-colors cursor-pointer"
                                                    >
                                                        <Star className={`w-3.5 h-3.5 text-amber-400 ${isAllSelectedStarred ? 'fill-amber-400' : ''}`} />
                                                        <span>{isAllSelectedStarred ? 'Unstar' : 'Add to Starred'}</span>
                                                    </button>

                                                    {/* Get Link (Single Folder) */}
                                                    {selectedIds.length === 1 && folders.some(f => f.id === selectedIds[0]) && onExportInvite && (() => {
                                                        const folder = folders.find(f => f.id === selectedIds[0]);
                                                        return folder ? (
                                                            <button
                                                                onClick={() => {
                                                                    onExportInvite(folder.id, folder.name);
                                                                    setShowSelectionMoreMenu(false);
                                                                }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-telegram-text hover:bg-telegram-hover transition-colors cursor-pointer"
                                                            >
                                                                <Share2 className="w-3.5 h-3.5 text-telegram-primary" />
                                                                <span>Get Link</span>
                                                            </button>
                                                        ) : null;
                                                    })()}

                                                    {/* Rename (Single Folder) */}
                                                    {selectedIds.length === 1 && folders.some(f => f.id === selectedIds[0]) && onFolderRename && (() => {
                                                        const folder = folders.find(f => f.id === selectedIds[0]);
                                                        return folder ? (
                                                            <button
                                                                onClick={() => {
                                                                    onFolderRename(folder.id, folder.name);
                                                                    setShowSelectionMoreMenu(false);
                                                                }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-telegram-text hover:bg-telegram-hover transition-colors cursor-pointer"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5 text-blue-400" />
                                                                <span>Rename</span>
                                                            </button>
                                                        ) : null;
                                                    })()}

                                                    {/* Remove Offline (Offline Tab) */}
                                                    {currentTab === 'offline' && (
                                                        <button
                                                            onClick={() => {
                                                                selectedIds.forEach(id => removeOfflineAccess(id));
                                                                toast.success(`Removed offline access for ${selectedIds.length} item(s)`);
                                                                onClearSelection();
                                                                setShowSelectionMoreMenu(false);
                                                            }}
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-telegram-text hover:bg-telegram-hover transition-colors cursor-pointer"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                                                            <span>Remove Offline</span>
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
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
