import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

import { TelegramFile, TelegramFolder, BandwidthStats, ShareInfo } from '../../types';
import { formatBytes, isMediaFile, isPdfFile, isArchiveFile, nativeShareOrCopy, copyToClipboard } from '../../utils';

// Components
import { Sidebar } from './dashboard/Sidebar';
import { TopBar } from './dashboard/TopBar';
import { FileExplorer } from './dashboard/FileExplorer';
import { UploadQueue } from './dashboard/UploadQueue';
import { DownloadQueue } from './dashboard/DownloadQueue';
import { MoveToFolderModal } from './dashboard/MoveToFolderModal';
import { PreviewModal } from './dashboard/PreviewModal';
import { MediaPlayer } from './dashboard/MediaPlayer';
import { ExternalDropBlocker } from './dashboard/ExternalDropBlocker';
import { PdfViewer } from './dashboard/PdfViewer';
import { ArchiveViewerModal } from './dashboard/ArchiveViewerModal';
import { SettingsModal } from './dashboard/SettingsModal';
import { RenameFolderModal } from './dashboard/RenameFolderModal';
import { RenameFileModal } from './dashboard/RenameFileModal';
import { RemoteUploadModal } from './dashboard/RemoteUploadModal';
import { InfoPanel } from './dashboard/InfoPanel';
import { GlobalHeader } from './dashboard/GlobalHeader';
import { useTheme } from '../../context/ThemeContext';
import { Link, Copy, Check, X, Loader2, Share2, Folder } from 'lucide-react';

// Hooks
import { useTelegramConnection } from '../../hooks/useTelegramConnection';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useFileDownload } from '../../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSettings } from '../../context/SettingsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDrive } from '../../context/DriveContext';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();

    const {
        store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete,
        handleFolderRename, handleFolderToggleVisibility, handleExportFolderInvite,
        handleReorderFolders, mutatingFolderIds
    } = useTelegramConnection(onLogout);

    const { settings, updateSetting } = useSettings();
    const { confirm } = useConfirm();
    const { theme, toggleTheme } = useTheme();

    const viewMode = settings.viewMode;
    const setViewMode = (mode: 'grid' | 'list') => updateSetting('viewMode', mode);

    const {
        currentTab,
        starredFiles,
        offlineFiles,
        isFolderStarred,
        trashedFiles,
        trashFile,
        deletePermanently,
        recentFiles,
        addRecentFile,
        isInfoPanelOpen,
        setActiveFileId,
        fileTypeFilter,
        setFileTypeFilter,
        trashedFolders,
        trashFolder,
        restoreFolder,
        restoreFile,
        deleteFolderPermanently,
        emptyTrash,
    } = useDrive();

    const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    
    // Clear selection when changing tabs or active folders
    useEffect(() => {
        setSelectedIds([]);
    }, [currentTab, activeFolderId, setSelectedIds]);

    const navigateToFolder = useCallback((id: number | null) => {
        setSelectedIds([]);
        setActiveFolderId(id);
    }, [setActiveFolderId, setSelectedIds]);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showNewFolderModal, setShowNewFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");

    const submitCreate = async () => {
        const name = newFolderName.trim();
        if (name) {
            try {
                await handleCreateFolder(name);
                setShowNewFolderModal(false);
                setNewFolderName("");
                queryClient.invalidateQueries({ queryKey: ['folders'] });
            } catch (e) {
                console.error("Failed to create folder:", e);
            }
        }
    };
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRequestRef = useRef(0);
    const internalDragRef = useRef<number[] | null>(null);

    const setInternalDragIds = (ids: number[] | null) => {
        internalDragRef.current = ids;
    };
    const [showRemoteUpload, setShowRemoteUpload] = useState(false);
    const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);
    const [pdfFile, setPdfFile] = useState<TelegramFile | null>(null);
    const [archiveViewFile, setArchiveViewFile] = useState<TelegramFile | null>(null);
    const [_shareFile, setShareFile] = useState<TelegramFile | null>(null);
    const [bulkShareLinks, setBulkShareLinks] = useState<Array<{ file: TelegramFile; link: string }> | null>(null);
    const [bulkShareLoading, setBulkShareLoading] = useState(false);
    const [bulkShareCopied, setBulkShareCopied] = useState<Set<string>>(new Set());
    const [previewContextFiles, setPreviewContextFiles] = useState<TelegramFile[]>([]);
    const [previewContextIndex, setPreviewContextIndex] = useState(-1);
    const [renameFolder, setRenameFolder] = useState<{ id: number; name: string } | null>(null);
    const [moveFileTarget, setMoveFileTarget] = useState<TelegramFile | null>(null);
    const [renameFileTarget, setRenameFileTarget] = useState<TelegramFile | null>(null);

    const { data: allFiles = [] as TelegramFile[], isLoading, error, refetch, isFetching } = useQuery<TelegramFile[]>({
        queryKey: ['files', activeFolderId],
        queryFn: async () => {
            if (activeFolderId === null) {
                return [];
            }
            let accumulatedFiles: TelegramFile[] = [];
            const actualFolderId = activeFolderId === -999 ? null : activeFolderId;

            const unlisten = await listen<any>('folder-load-chunk', (event) => {
                const payload = event.payload;
                if (payload.folderId === actualFolderId) {
                    const newChunk = payload.files.map((f: any) => ({
                        ...f,
                        sizeStr: formatBytes(f.size),
                        type: (f.icon_type as TelegramFile['type']) || 'file'
                    }));
                    const fileMap = new Map(accumulatedFiles.map(file => [file.id, file]));
                    newChunk.forEach((file: any) => fileMap.set(file.id, file));
                    accumulatedFiles = Array.from(fileMap.values());
                    queryClient.setQueryData(['files', activeFolderId], accumulatedFiles);
                }
            });

            try {
                await invoke('cmd_get_files', { folderId: actualFolderId });
                return accumulatedFiles;
            } finally {
                unlisten();
            }
        },
        enabled: !!store && activeFolderId !== null,
    });

    // This is a local SQLite read, not a Telegram request. It lets the UI mark
    // files for which this app still has an active share link.
    const { data: activeShares = [] as ShareInfo[] } = useQuery<ShareInfo[]>({
        queryKey: ['active-shares'],
        queryFn: () => invoke<ShareInfo[]>('cmd_list_shares'),
        enabled: !!store,
    });

    const filesWithShareStatus = useMemo(() => {
        const sharedKeys = new Set(activeShares.map(share =>
            `${share.folder_id ?? 'root'}:${share.message_id}`
        ));
        return allFiles.map(file => ({
            ...file,
            is_shared_by_me: sharedKeys.has(`${file.folder_id ?? 'root'}:${file.id}`),
        }));
    }, [allFiles, activeShares]);

    const searchResultsWithShareStatus = useMemo(() => {
        const sharedKeys = new Set(activeShares.map(share =>
            `${share.folder_id ?? 'root'}:${share.message_id}`
        ));
        return searchResults.map(file => ({
            ...file,
            is_shared_by_me: sharedKeys.has(`${file.folder_id ?? 'root'}:${file.id}`),
        }));
    }, [searchResults, activeShares]);

    const filteredFilesByTab = useMemo(() => {
        const sourceFiles = searchTerm.trim() ? searchResultsWithShareStatus : filesWithShareStatus;
        let list: TelegramFile[] = sourceFiles;

        // 1. Tab filtering
        if (currentTab === 'trash') {
            list = trashedFiles;
        } else {
            const trashedIds = new Set(trashedFiles.map(f => f.id));
            if (currentTab === 'starred') {
                list = starredFiles.filter(f => !trashedIds.has(f.id));
            } else if (currentTab === 'offline') {
                list = offlineFiles.filter(f => !trashedIds.has(f.id));
            } else if (currentTab === 'recent') {
                list = recentFiles.filter(f => !trashedIds.has(f.id));
            } else if (currentTab === 'shared') {
                const sharedFolderIds = new Set(folders.filter(f => f.is_shared_with_me).map(f => f.id));
                list = sourceFiles.filter(file => sharedFolderIds.has(file.folder_id ?? activeFolderId ?? NaN) && !trashedIds.has(file.id));
            } else {
                // 'my-drive' or others: exclude trashed files!
                list = sourceFiles.filter(f => !trashedIds.has(f.id));
            }
        }

        // 2. Google Drive search filter category selection
        if (fileTypeFilter && fileTypeFilter !== 'all') {
            list = list.filter(file => {
                const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
                const mime = file.mime_type?.toLowerCase() || '';
                if (fileTypeFilter === 'pdf') {
                    return ext === 'pdf' || mime === 'application/pdf';
                }
                if (fileTypeFilter === 'image') {
                    return mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                }
                if (fileTypeFilter === 'video') {
                    return mime.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v'].includes(ext);
                }
                if (fileTypeFilter === 'audio') {
                    return mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext);
                }
                if (fileTypeFilter === 'document') {
                    return mime.startsWith('text/') || mime.includes('document') || mime.includes('spreadsheet') || mime.includes('presentation') || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'].includes(ext);
                }
                if (fileTypeFilter === 'archive') {
                    return mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext);
                }
                return true;
            });
        }

        return list;
    }, [filesWithShareStatus, searchTerm, searchResults, currentTab, trashedFiles, starredFiles, offlineFiles, recentFiles, fileTypeFilter, folders, activeFolderId]);

    const displayedFiles = filteredFilesByTab.filter((f: TelegramFile) =>
        f.name.toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase())
    );

    const activeFolders = useMemo(() => {
        const trashedIds = new Set(trashedFolders.map(tf => tf.id));
        return folders.filter(f => !trashedIds.has(f.id));
    }, [folders, trashedFolders]);

    const displayFolders = useMemo(() => {
        if (currentTab === 'trash') {
            return trashedFolders.map(tf => ({
                id: tf.id,
                name: tf.name,
            }));
        }

        if (currentTab === 'starred') {
            return activeFolders.filter(folder => isFolderStarred(folder.id));
        }

        if (currentTab === 'offline' || currentTab === 'recent') {
            return [];
        }

        if (currentTab === 'shared' && activeFolderId === null) {
            return activeFolders.filter(folder => folder.is_shared_with_me);
        }

        if (activeFolderId === null) {
            const virtualFolder: TelegramFolder = {
                id: -999,
                name: 'Saved Messages',
            };
            const ownedFolders = activeFolders.filter(folder => !folder.is_shared_with_me);
            return [virtualFolder, ...ownedFolders];
        }
        return activeFolders;
    }, [activeFolderId, currentTab, trashedFolders, activeFolders, isFolderStarred]);

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => invoke<BandwidthStats>('cmd_get_bandwidth'),
        refetchInterval: 5000,
        enabled: !!store
    });

    const { data: totalStorageSize = 0 } = useQuery<number>({
        queryKey: ['totalStorageSize'],
        queryFn: () => invoke<number>('cmd_get_total_files_size'),
        refetchInterval: 15000,
        enabled: !!store
    });


    const { uploadQueue, setUploadQueue, handleManualUpload, handleFolderUpload, handleDropUpload, handleUrlUpload, cancelAll: cancelUploads, cancelItem: cancelUploadItem, retryItem: retryUploadItem } = useFileUpload(activeFolderId, store);
    const { downloadQueue, queueDownload, queueBulkDownload, clearFinished: clearDownloads, cancelAll: cancelDownloads, cancelItem: cancelDownloadItem, retryItem: retryDownloadItem } = useFileDownload(store);

    const {
        handleDelete: originalDelete, handleBulkDelete: originalBulkDelete, handleBulkDownload,
        handleBulkMove, handleDownloadFolder, handleGlobalSearch
    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles, queueBulkDownload);

    const handleDownloadSpecificFolder = useCallback(async (folderId: number, folderName: string) => {
        const toastId = toast.loading(`Preparing download for folder "${folderName}"...`);
        try {
            const actualFolderId = folderId === -999 ? null : folderId;
            let accumulatedFiles: TelegramFile[] = [];
            
            const unlisten = await listen<{ files: any[] }>('folder-load-chunk', (event) => {
                const payload = event.payload;
                if (payload && Array.isArray(payload.files)) {
                    const newChunk = payload.files.map((f: any) => ({
                        ...f,
                        sizeStr: formatBytes(f.size),
                        type: (f.icon_type as TelegramFile['type']) || 'file'
                    }));
                    accumulatedFiles.push(...newChunk);
                }
            });

            try {
                await invoke('cmd_get_files', { folderId: actualFolderId });
            } finally {
                unlisten();
            }

            toast.dismiss(toastId);
            if (accumulatedFiles.length === 0) {
                toast.info(`Folder "${folderName}" is empty.`);
                return;
            }
            queueBulkDownload(accumulatedFiles, actualFolderId);
            toast.success(`Enqueued ${accumulatedFiles.length} files from folder "${folderName}" for download.`);
        } catch (e) {
            toast.dismiss(toastId);
            toast.error(`Failed to download folder: ${e}`);
        }
    }, [queueBulkDownload]);

    // Global window click listener to clear file/folder selections when clicking empty backgrounds
    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // Exclude clicks on items, modals, dialogs, buttons, inputs, context menus, and the detail drawer info panel
            if (
                target.closest('[data-file-id]') ||
                target.closest('[data-folder-id]') ||
                target.closest('button') ||
                target.closest('input') ||
                target.closest('select') ||
                target.closest('a') ||
                target.closest('[role="menu"]') ||
                target.closest('[role="dialog"]') ||
                target.closest('.info-panel')
            ) {
                return;
            }
            
            setSelectedIds([]);
        };
        
        window.addEventListener('mousedown', handleGlobalClick);
        return () => window.removeEventListener('mousedown', handleGlobalClick);
    }, [setSelectedIds]);


    const handleDelete = useCallback(async (id: number) => {
        if (currentTab === 'trash') {
            const trashedFile = trashedFiles.find(file => file.id === id);
            if (trashedFile) {
                if (!await confirm({
                    title: "Delete File Permanently",
                    message: `Are you sure you want to permanently delete file "${trashedFile.name}"? This action cannot be undone.`,
                    confirmText: "Delete Permanently",
                    variant: 'danger'
                })) return;
                const deleted = await originalDelete(id, trashedFile.originalFolderId, true);
                if (deleted) {
                    deletePermanently(id);
                    setSelectedIds(prev => prev.filter(x => x !== id));
                }
            } else {
                const trashedFolderObj = trashedFolders.find(f => f.id === id);
                if (trashedFolderObj) {
                    if (!await confirm({
                        title: "Delete Folder Permanently",
                        message: `Are you sure you want to permanently delete folder "${trashedFolderObj.name}"? This action cannot be undone.`,
                        confirmText: "Delete Permanently",
                        variant: 'danger'
                    })) return;
                    await handleFolderDelete(id, trashedFolderObj.name, true);
                    deleteFolderPermanently(id);
                    setSelectedIds(prev => prev.filter(x => x !== id));
                    toast.success(`Permanently deleted folder "${trashedFolderObj.name}".`);
                }
            }
        } else {
            const file = displayedFiles.find(f => f.id === id);
            if (file) {
                if (!await confirm({
                    title: "Move File to Trash",
                    message: `Are you sure you want to move file "${file.name}" to Trash?`,
                    confirmText: "Move to Trash",
                    variant: 'danger'
                })) return;
                trashFile(file, file.folder_id ?? activeFolderId);
                setSelectedIds(prev => prev.filter(x => x !== id));
                toast.success(`Moved "${file.name}" to Trash.`);
            } else {
                const folderObj = folders.find(f => f.id === id);
                if (folderObj) {
                    if (!await confirm({
                        title: "Move Folder to Trash",
                        message: `Are you sure you want to move folder "${folderObj.name}" to Trash? All files inside this folder will also be hidden until restored.`,
                        confirmText: "Move to Trash",
                        variant: 'danger'
                    })) return;
                    trashFolder(folderObj);
                    setSelectedIds(prev => prev.filter(x => x !== id));
                    toast.success(`Moved folder "${folderObj.name}" to Trash.`);
                }
            }
        }
    }, [currentTab, originalDelete, deletePermanently, displayedFiles, trashFile, trashedFiles, trashedFolders, trashFolder, deleteFolderPermanently, folders, handleFolderDelete, setSelectedIds, activeFolderId, confirm]);

    const handleBulkDelete = useCallback(async () => {
        if (currentTab === 'trash') {
            const filesToDelete = selectedIds.filter(id => trashedFiles.some(f => f.id === id));
            const foldersToDelete = selectedIds.filter(id => trashedFolders.some(f => f.id === id));
            const total = filesToDelete.length + foldersToDelete.length;
            if (total === 0) return;

            if (!await confirm({
                title: "Delete Items Permanently",
                message: `Are you sure you want to permanently delete the selected ${total} item(s)? This action cannot be undone.`,
                confirmText: "Delete Permanently",
                variant: 'danger'
            })) return;

            if (filesToDelete.length > 0) {
                const deletedIds = await originalBulkDelete(filesToDelete.map(id => {
                    const trashedFile = trashedFiles.find(file => file.id === id);
                    return { id, folderId: trashedFile?.originalFolderId ?? activeFolderId };
                }), true);
                deletedIds.forEach(deletePermanently);
            }

            for (const folderId of foldersToDelete) {
                const trashedFolderObj = trashedFolders.find(f => f.id === folderId);
                if (trashedFolderObj) {
                    await handleFolderDelete(folderId, trashedFolderObj.name, true);
                    deleteFolderPermanently(folderId);
                }
            }
            setSelectedIds([]);
        } else {
            const filesToTrash = displayedFiles.filter(f => selectedIds.includes(f.id));
            const foldersToTrash = folders.filter(f => selectedIds.includes(f.id));
            const total = filesToTrash.length + foldersToTrash.length;
            if (total === 0) return;

            if (!await confirm({
                title: "Move Items to Trash",
                message: `Are you sure you want to move the selected ${total} item(s) to Trash?`,
                confirmText: "Move to Trash",
                variant: 'danger'
            })) return;

            filesToTrash.forEach(file => trashFile(file, file.folder_id ?? activeFolderId));
            foldersToTrash.forEach(folder => trashFolder(folder));

            setSelectedIds([]);
            toast.success(`Moved ${total} item(s) to Trash.`);
        }
    }, [currentTab, originalBulkDelete, selectedIds, displayedFiles, folders, trashFile, trashFolder, trashedFiles, trashedFolders, setSelectedIds, deletePermanently, deleteFolderPermanently, handleFolderDelete, activeFolderId, confirm]);

    const handleRestoreSelected = useCallback(() => {
        for (const id of selectedIds) {
            const isFile = trashedFiles.some(f => f.id === id);
            if (isFile) {
                restoreFile(id);
            } else {
                restoreFolder(id);
            }
        }
        setSelectedIds([]);
        toast.success("Restored selected items");
    }, [selectedIds, trashedFiles, restoreFile, restoreFolder]);

    // Bulk share: generate links for all selected non-folder files
    const handleBulkShare = useCallback(async () => {
        const shareFiles = displayedFiles.filter(f => selectedIds.includes(f.id) && f.type !== 'folder');
        if (shareFiles.length === 0) {
            toast.info('No shareable files selected (folders cannot be shared)');
            return;
        }
        setBulkShareLinks([]);
        setBulkShareLoading(true);
        setBulkShareCopied(new Set());
        try {
            const results = await Promise.all(
                shareFiles.map(async (file) => {
                    try {
                        const info = await invoke<ShareInfo>('cmd_create_share', {
                            folderId: file.folder_id ?? null,
                            messageId: file.id,
                            fileName: file.name,
                            fileSize: file.size,
                            password: null,
                            expiryHours: 24,
                        });
                        return { file, link: info.link };
                    } catch (e) {
                        toast.error(`Failed to share ${file.name}: ${e}`);
                        return null;
                    }
                })
            );
            const valid = results.filter((r): r is any => r !== null);
            if (valid.length > 0) {
                setBulkShareLinks(valid);
                setSelectedIds([]);
            } else {
                setBulkShareLinks(null);
                toast.error('Failed to generate any share links');
            }
        } finally {
            setBulkShareLoading(false);
        }
    }, [displayedFiles, selectedIds]);

    const handleCopyBulkLink = useCallback((link: string) => {
        navigator.clipboard.writeText(link);
        setBulkShareCopied(prev => new Set(prev).add(link));
        setTimeout(() => setBulkShareCopied(prev => {
            const next = new Set(prev);
            next.delete(link);
            return next;
        }), 2000);
    }, []);


    const handleSelectAll = useCallback(() => {
        let idsToSelect: number[] = [];
        
        // Files in the current tab/folder are always selectable
        const fileIds = displayedFiles.map(f => f.id);
        idsToSelect = [...fileIds];

        // Folders are only visible and selectable when at the root (activeFolderId === null)
        // inside the My Drive or Trash tabs.
        if (activeFolderId === null) {
            if (currentTab === 'my-drive') {
                const folderIds = folders
                    .filter(f => f.id !== -999)
                    .map(f => f.id);
                idsToSelect.push(...folderIds);
            } else if (currentTab === 'trash') {
                const folderIds = trashedFolders.map(f => f.id);
                idsToSelect.push(...folderIds);
            }
        }
        
        setSelectedIds(idsToSelect);
    }, [currentTab, trashedFolders, folders, displayedFiles, activeFolderId]);

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDelete();
        }
    }, [selectedIds, handleBulkDelete]);

    const handleEscape = useCallback(() => {
        lastClickedIndexRef.current = -1;
        setSelectedIds([]);
        setSearchTerm("");
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
        setArchiveViewFile(null);
    }, []);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, []);

    const handleEnter = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) {
                if (selected.type === 'folder') {
                    navigateToFolder(selected.id);
                } else {
                    handlePreview(selected, displayedFiles);
                }
            }
        }
    }, [selectedIds, displayedFiles, setActiveFolderId]);


    useEffect(() => {
        lastClickedIndexRef.current = -1;
        setSelectedIds([]);
        setShowMoveModal(false);
        setSearchTerm("");
        setSearchResults([]);
        searchRequestRef.current += 1;
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
        setPreviewContextFiles([]);
        setPreviewContextIndex(-1);
        setArchiveViewFile(null);
        invoke('cmd_clean_local_cache').catch(() => {});
    }, [activeFolderId]);


    useEffect(() => {
        const query = searchTerm.trim();
        if (!query) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const requestId = ++searchRequestRef.current;
        // Do not show matches for the previous query while this one is pending.
        setSearchResults([]);
        setIsSearching(true);
        const timer = setTimeout(async () => {
            const results = await handleGlobalSearch(query);
            // An earlier, slower request must not replace the newest search.
            if (requestId === searchRequestRef.current) {
                setSearchResults(results);
                setIsSearching(false);
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            if (requestId === searchRequestRef.current) setIsSearching(false);
        };
    }, [searchTerm, handleGlobalSearch]);




    const lastClickedIndexRef = useRef<number>(-1);

    const clearSelection = useCallback(() => {
        lastClickedIndexRef.current = -1;
        setSelectedIds([]);
    }, []);

    const handleFileClick = (e: React.MouseEvent, id: number, orderedFiles: TelegramFile[] = []) => {
        e.stopPropagation();
        const filesSource = orderedFiles.length > 0 ? orderedFiles : displayedFiles;
        const currentIndex = filesSource.findIndex(f => f.id === id);

        if (e.shiftKey && lastClickedIndexRef.current >= 0) {
            // Shift+Click: range select from last clicked to current
            const start = Math.min(lastClickedIndexRef.current, currentIndex);
            const end = Math.max(lastClickedIndexRef.current, currentIndex);
            const rangeIds = filesSource.slice(start, end + 1).map(f => f.id);
            setSelectedIds(rangeIds);
            setActiveFileId(null);
        } else if (e.metaKey || e.ctrlKey) {
            // Ctrl/Cmd+Click: toggle individual file
            lastClickedIndexRef.current = currentIndex;
            setSelectedIds(ids => {
                const nextIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id];
                if (nextIds.length === 1) {
                    setActiveFileId(nextIds[0]);
                } else {
                    setActiveFileId(null);
                }
                return nextIds;
            });
        } else {
            // Plain click: select single file
            lastClickedIndexRef.current = currentIndex;
            setSelectedIds([id]);
            setActiveFileId(id);
        }
    }

    const handleToggleSelection = useCallback((id: number) => {
        setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
    }, []);

    const handleFileMove = useCallback((file: TelegramFile) => {
        setMoveFileTarget(file);
        setShowMoveModal(true);
    }, []);

    const handleRename = useCallback((file: TelegramFile) => {
        setRenameFileTarget(file);
    }, []);

    const handleRenameSubmit = useCallback(async (newName: string) => {
        if (!renameFileTarget) return;
        const folderId = renameFileTarget.folder_id ?? activeFolderId;
        try {
            await invoke('cmd_rename_file', {
                messageId: renameFileTarget.id,
                folderId,
                newName,
            });
            queryClient.invalidateQueries({ queryKey: ['files', folderId] });
            toast.success(`Renamed to "${newName}"`);
        } catch (e) {
            toast.error(`Failed to rename: ${e}`);
            throw e;
        }
    }, [renameFileTarget, activeFolderId, queryClient]);

    const handleDownloadFile = useCallback((file: TelegramFile) => {
        queueDownload(file.id, file.name, file.folder_id ?? activeFolderId);
    }, [queueDownload, activeFolderId]);

    const handleKeyboardDownload = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDownload();
        }
    }, [selectedIds, handleBulkDownload]);

    const handleKeyboardShare = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkShare();
        }
    }, [selectedIds, handleBulkShare]);

    const handleKeyboardRename = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) {
                handleRename(selected);
            }
        }
    }, [selectedIds, displayedFiles, handleRename]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onEnter: handleEnter,
        onDownload: handleKeyboardDownload,
        onShare: handleKeyboardShare,
        onRename: handleKeyboardRename,
        enabled: !previewFile && !playingFile && !pdfFile && !archiveViewFile && !showMoveModal
    });

    const handlePreview = (file: TelegramFile, orderedFiles?: TelegramFile[]) => {
        addRecentFile(file);
        const contextFiles = (orderedFiles || displayedFiles).filter((f) => f.type !== 'folder');
        const contextIndex = contextFiles.findIndex((f) => f.id === file.id);

        setPreviewContextFiles(contextFiles);
        setPreviewContextIndex(contextIndex);

        const isMedia = isMediaFile(file.name, file.mime_type);
        const isPdf = isPdfFile(file.name, file.mime_type);
        const isArchive = isArchiveFile(file.name, file.mime_type);

        if (isArchive) {
            setArchiveViewFile(file);
            setPreviewFile(null);
            setPlayingFile(null);
            setPdfFile(null);
        } else if (isMedia) {
            setPlayingFile(file);
            setPreviewFile(null);
            setPdfFile(null);
            setArchiveViewFile(null);
        } else if (isPdf) {
            setPdfFile(file);
            setPreviewFile(null);
            setPlayingFile(null);
            setArchiveViewFile(null);
        } else {
            setPreviewFile(file);
            setPlayingFile(null);
            setPdfFile(null);
            setArchiveViewFile(null);
        }
    };

    const navigatePreview = useCallback((step: 1 | -1) => {
        if (previewContextFiles.length === 0) return;

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id ?? archiveViewFile?.id;
        if (!currentFileId) return;

        const currentIndex = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + step + previewContextFiles.length) % previewContextFiles.length;
        const nextFile = previewContextFiles[nextIndex];
        if (!nextFile) return;

        setPreviewContextIndex(nextIndex);

        const isMedia = isMediaFile(nextFile.name, nextFile.mime_type);
        const isPdf = isPdfFile(nextFile.name, nextFile.mime_type);
        const isArchive = isArchiveFile(nextFile.name, nextFile.mime_type);

        if (isArchive) {
            setArchiveViewFile(nextFile);
            setPreviewFile(null);
            setPlayingFile(null);
            setPdfFile(null);
        } else if (isMedia) {
            setPlayingFile(nextFile);
            setPreviewFile(null);
            setPdfFile(null);
            setArchiveViewFile(null);
        } else if (isPdf) {
            setPdfFile(nextFile);
            setPreviewFile(null);
            setPlayingFile(null);
            setArchiveViewFile(null);
        } else {
            setPreviewFile(nextFile);
            setPlayingFile(null);
            setPdfFile(null);
            setArchiveViewFile(null);
        }
    }, [previewContextFiles, previewFile, playingFile, pdfFile, archiveViewFile]);

    const handleNextPreview = useCallback(() => {
        navigatePreview(1);
    }, [navigatePreview]);

    const handlePrevPreview = useCallback(() => {
        navigatePreview(-1);
    }, [navigatePreview]);

    const previewNeighborFiles = useCallback(() => {
        if (previewContextFiles.length === 0) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id ?? archiveViewFile?.id;
        if (!currentFileId) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentIdx = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIdx === -1) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const nextIdx = (currentIdx + 1) % previewContextFiles.length;
        const prevIdx = (currentIdx - 1 + previewContextFiles.length) % previewContextFiles.length;

        return {
            nextFile: previewContextFiles[nextIdx] || null,
            prevFile: previewContextFiles[prevIdx] || null,
        };
    }, [previewContextFiles, previewFile, playingFile, pdfFile, archiveViewFile]);

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        // Read multi-ID drag data (new format) or fall back to single-ID (legacy)
        let idsToMove: number[] | null = null;
        const rawIds = e.dataTransfer.getData("application/x-telegram-file-ids");
        if (rawIds) {
            try { idsToMove = JSON.parse(rawIds); } catch { /* ignore parse errors */ }
        }
        if (!idsToMove || idsToMove.length === 0) {
            const singleId = e.dataTransfer.getData("application/x-telegram-file-id");
            if (singleId) idsToMove = [parseInt(singleId)];
        }
        if (!idsToMove || idsToMove.length === 0) {
            idsToMove = internalDragRef.current;
        }
        if (!idsToMove || idsToMove.length === 0) return;

        if (activeFolderId === targetFolderId) {
            toast.info('File is already in this folder');
            return;
        }

        if (idsToMove.length >= 10) {
            const confirmed = await confirm({
                title: 'Bulk Move Confirmation',
                message: `You are about to move ${idsToMove.length} files. Are you sure?`,
                confirmText: `Move ${idsToMove.length} Files`,
                variant: 'info',
            });
            if (!confirmed) return;
        }

        try {
            await invoke('cmd_move_files', {
                messageIds: idsToMove,
                sourceFolderId: activeFolderId,
                targetFolderId: targetFolderId
            });
            // Clean up stale thumbnail and preview cache entries for the old message IDs
            await Promise.all(idsToMove.flatMap(id => [
                invoke('cmd_delete_image_thumbnail', { messageId: id, folderId: activeFolderId }).catch(() => {}),
                invoke('cmd_delete_preview_for_message', { messageId: id, folderId: activeFolderId }).catch(() => {}),
            ]));

            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
            setSelectedIds([]);
            toast.success(`Moved ${idsToMove.length} file(s).`);
            setInternalDragIds(null);
        } catch {
            toast.error(`Failed to move file(s).`);
        }
    }

    const currentFolderName = activeFolderId === null
        ? ""
        : activeFolderId === -999
            ? "Saved Messages"
            : folders.find(f => f.id === activeFolderId)?.name || "Folder";


    const handleRootDragOver = (e: React.DragEvent) => {
        // Accept our internal file drags (custom MIME type) so drops work anywhere
        const isInternalDrag = internalDragRef.current !== null ||
            e.dataTransfer.types.includes("application/x-telegram-file-id") ||
            e.dataTransfer.types.includes("application/x-telegram-file-ids");
        if (isInternalDrag) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleRootDragEnter = (e: React.DragEvent) => {
        const isInternalDrag = internalDragRef.current !== null ||
            e.dataTransfer.types.includes("application/x-telegram-file-id") ||
            e.dataTransfer.types.includes("application/x-telegram-file-ids");
        if (isInternalDrag) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const previewNeighbors = previewNeighborFiles();

    return (
        <div
            className="flex flex-col h-full max-h-screen w-full overflow-hidden bg-telegram-bg relative"
            onDragOver={handleRootDragOver}
            onDragEnter={handleRootDragEnter}
        >

            {currentTab === 'my-drive' && activeFolderId !== null && (
                <ExternalDropBlocker onFilesDropped={handleDropUpload} onUploadClick={handleManualUpload} />
            )}

            <GlobalHeader
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                fileTypeFilter={fileTypeFilter}
                setFileTypeFilter={setFileTypeFilter}
                onSettingsClick={() => setShowSettings(true)}
                theme={theme}
                toggleTheme={toggleTheme}
                isConnected={isConnected}
                onLogout={handleLogout}
            />

            <div className="flex flex-1 min-h-0">

            <AnimatePresence>
                {showMoveModal && (
                    <MoveToFolderModal
                        folders={activeFolders}
                        fileName={moveFileTarget?.name}
                        onClose={() => { setShowMoveModal(false); setMoveFileTarget(null); }}
                        onSelect={async (targetFolderId: number | null) => {
                            if (moveFileTarget) {
                                try {
                                    const actualSourceFolderId = activeFolderId === -999 ? null : activeFolderId;
                                    const actualTargetFolderId = targetFolderId === -999 ? null : targetFolderId;
                                    await invoke('cmd_move_files', {
                                        messageIds: [moveFileTarget.id],
                                        sourceFolderId: actualSourceFolderId,
                                        targetFolderId: actualTargetFolderId,
                                    });
                                    // Clean up stale thumbnail and preview cache for the old message ID
                                    await Promise.all([
                                        invoke('cmd_delete_image_thumbnail', { messageId: moveFileTarget.id, folderId: actualSourceFolderId }).catch(() => {}),
                                        invoke('cmd_delete_preview_for_message', { messageId: moveFileTarget.id, folderId: actualSourceFolderId }).catch(() => {}),
                                    ]);
                                    queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
                                    toast.success(`Moved "${moveFileTarget.name}"`);
                                    setMoveFileTarget(null);
                                    setShowMoveModal(false);
                                } catch {
                                    toast.error('Failed to move file');
                                }
                            } else {
                                handleBulkMove(targetFolderId === -999 ? null : targetFolderId, () => setShowMoveModal(false));
                            }
                        }}
                        activeFolderId={activeFolderId}
                        key="move-modal"
                    />
                )}
                {playingFile && (
                    <MediaPlayer
                        file={playingFile}
                        onClose={() => setPlayingFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={activeFolderId}
                        key={playingFile.id}
                    />
                )}
                {pdfFile && (
                    <PdfViewer
                        file={pdfFile}
                        onClose={() => setPdfFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={activeFolderId}
                        key="pdf-viewer"
                    />
                )}
                {showRemoteUpload && (
                    <RemoteUploadModal
                        isOpen={showRemoteUpload}
                        onClose={() => setShowRemoteUpload(false)}
                        folders={activeFolders}
                        onUpload={handleUrlUpload}
                        key="remote-upload-modal"
                    />
                )}
            </AnimatePresence>

            <Sidebar
                folders={activeFolders}
                activeFolderId={activeFolderId}
                setActiveFolderId={navigateToFolder}
                onDrop={handleDropOnFolder}
                onDelete={handleDelete}
                onRename={(id, name) => setRenameFolder({ id, name })}
                onToggleVisibility={async (id, _name, isPublic) => {
                    try {
                        await handleFolderToggleVisibility(id, !isPublic);
                        queryClient.invalidateQueries({ queryKey: ['folders'] });
                    } catch { /* toast handled in hook */ }
                }}
                onExportInvite={async (id, _name) => {
                    try {
                        const info = await handleExportFolderInvite(id);
                        try {
                            await copyToClipboard(info.link);
                            toast.success(`Invite link copied: ${info.link}`);
                        } catch (e) {
                            toast.error(`Failed to copy to clipboard: ${e}`);
                        }
                    } catch { /* backend error already toasted in hook */ }
                }}
                onCreate={handleCreateFolder}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                bandwidth={bandwidth || null}
                onReorderFolders={handleReorderFolders}
                onManualUpload={handleManualUpload}
                onFolderUpload={handleFolderUpload}
                onRemoteUploadClick={() => setShowRemoteUpload(true)}
                onNewFolderRequest={() => setShowNewFolderModal(true)}
                totalStorageSize={totalStorageSize}
            />

            <div className="flex-1 flex bg-telegram-surface border border-telegram-border/40 shadow-sm rounded-3xl overflow-hidden my-3 mr-3 ml-1 min-w-0 relative">
                <main className="flex-1 flex flex-col min-w-0">
                    <TopBar
                        currentFolderName={currentFolderName}
                        selectedIds={selectedIds}
                        folders={activeFolders}
                        files={filesWithShareStatus}
                        onShowMoveModal={() => {
                            const hasFolders = folders.some(f => selectedIds.includes(f.id));
                            if (hasFolders) {
                                toast.info("Folders cannot be moved. Nested folders are not supported.");
                                return;
                            }
                            setShowMoveModal(true);
                        }}
                        onBulkDownload={handleBulkDownload}
                        onBulkDelete={handleBulkDelete}
                        onBulkShare={handleBulkShare}
                        onDownloadFolder={handleDownloadFolder}
                        onClearSelection={clearSelection}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        onRemoteUploadClick={() => setShowRemoteUpload(true)}
                        onGoToRoot={() => navigateToFolder(null)}
                        onRefresh={refetch}
                        isRefreshing={isFetching}
                        onBulkRestore={handleRestoreSelected}
                        activeFolderId={activeFolderId}
                        onFolderRename={(id, name) => setRenameFolder({ id, name })}
                        onExportInvite={async (id) => {
                            try {
                                const info = await handleExportFolderInvite(id);
                                try {
                                    await copyToClipboard(info.link);
                                    toast.success(`Invite link copied: ${info.link}`);
                                } catch (e) {
                                    toast.error(`Failed to copy to clipboard: ${e}`);
                                }
                            } catch (e) {
                                toast.error(`Failed to export invite link: ${e}`);
                            }
                        }}
                        onDownloadFolderById={handleDownloadSpecificFolder}
                    />
                    {searchTerm.trim() && (
                        <div className="px-6 pt-4 pb-0">
                            <h2 className="text-sm font-medium text-telegram-subtext">
                                Search Results for <span className="text-telegram-primary">"{searchTerm}"</span>
                            </h2>
                        </div>
                    )}
                    {currentTab === 'trash' && (trashedFiles.length > 0 || trashedFolders.length > 0) && (
                        <div className="mx-6 mt-4 p-3 bg-telegram-hover/30 border border-telegram-border/30 rounded-xl flex items-center justify-between text-xs text-telegram-subtext animate-in fade-in duration-200">
                            <span>Items in Trash will be permanently deleted after 30 days.</span>
                            <button
                                onClick={async () => {
                                    if (await confirm({
                                        title: "Empty Trash",
                                        message: "Are you sure you want to permanently delete all items in the Trash? This action cannot be undone.",
                                        confirmText: "Empty Trash",
                                        variant: 'danger'
                                    })) {
                                        try {
                                            await emptyTrash(
                                                async (fileId, folderId) => {
                                                    await originalDelete(fileId, folderId);
                                                },
                                                async (folderId, folderName) => {
                                                    await handleFolderDelete(folderId, folderName, true);
                                                }
                                            );
                                            toast.success("Trash emptied.");
                                        } catch (e) {
                                            toast.error(`Failed to empty trash: ${e}`);
                                        }
                                    }
                                }}
                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                                Empty Trash
                            </button>
                        </div>
                    )}
                    <FileExplorer
                        folders={displayFolders}
                        mutatingFolderIds={Array.from(mutatingFolderIds)}
                        files={displayedFiles}
                        loading={(isLoading && allFiles.length === 0) || isSearching}
                        error={error}
                        viewMode={viewMode}
                        selectedIds={selectedIds}
                        activeFolderId={activeFolderId}
                        onFileClick={handleFileClick}
                        onDelete={handleDelete}
                        onDownload={(id) => {
                            const file = displayedFiles.find(item => item.id === id);
                            if (file) handleDownloadFile(file);
                        }}
                        onPreview={handlePreview}
                        onManualUpload={handleManualUpload}
                        onFolderUpload={handleFolderUpload}
                        showFolderUpload={settings.zipFolders}
                        onToggleSelection={handleToggleSelection}
                        onDrop={handleDropOnFolder}
                        onDragStart={(ids) => setInternalDragIds(ids)}
                        onDragEnd={() => setTimeout(() => setInternalDragIds(null), 50)}
                        onShare={setShareFile}
                        onRename={handleRename}
                        onFileMove={handleFileMove}

                        onFolderOpen={(id) => {
                            if (currentTab === 'trash') {
                                const folder = trashedFolders.find(f => f.id === id);
                                toast.info(`Folder "${folder?.name || ''}" is in Trash. Please restore it to view its contents.`);
                                return;
                            }
                            navigateToFolder(id);
                        }}
                        onSelectionChange={(ids) => setSelectedIds(ids)}
                    />
                </main>

                {isInfoPanelOpen && (
                    <InfoPanel
                        selectedFiles={displayedFiles.filter(f => selectedIds.includes(f.id))}
                        selectedFolders={currentTab === 'trash'
                            ? trashedFolders.filter(f => selectedIds.includes(f.id))
                            : folders.filter(f => selectedIds.includes(f.id))}
                        folders={activeFolders}
                        onDownload={handleDownloadFile}
                        onDelete={(file) => handleDelete(file.id)}
                        onShare={(file) => setShareFile(file)}
                        onRename={(file) => handleRename(file)}
                        onMove={(file) => handleFileMove(file)}
                        onFolderRename={(id: number, name: string) => setRenameFolder({ id, name })}
                        onFolderDelete={(id: number) => { handleDelete(id); }}
                        activeFolderId={activeFolderId}
                    />
                )}
            </div>
            </div>

            {previewFile && (
                <PreviewModal
                    file={previewFile}
                    activeFolderId={activeFolderId}
                    folders={folders}
                    onClose={() => setPreviewFile(null)}
                    onNext={handleNextPreview}
                    onPrev={handlePrevPreview}
                    currentIndex={previewContextIndex}
                    totalItems={previewContextFiles.length}
                    nextFile={previewNeighbors.nextFile}
                    prevFile={previewNeighbors.prevFile}
                />
            )}

            {archiveViewFile && (
                <ArchiveViewerModal
                    file={archiveViewFile}
                    activeFolderId={activeFolderId}
                    folders={folders}
                    onClose={() => setArchiveViewFile(null)}
                    onNext={handleNextPreview}
                    onPrev={handlePrevPreview}
                    currentIndex={previewContextIndex}
                    totalItems={previewContextFiles.length}
                    nextFile={previewNeighbors.nextFile}
                    prevFile={previewNeighbors.prevFile}
                />
            )}

            <UploadQueue
                items={uploadQueue}
                onClearFinished={() => setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'error' && i.status !== 'cancelled'))}
                onCancelAll={cancelUploads}
                onCancelItem={cancelUploadItem}
                onRetryItem={retryUploadItem}
            />
            <DownloadQueue
                items={downloadQueue}
                onClearFinished={clearDownloads}
                onCancelAll={cancelDownloads}
                onCancelItem={cancelDownloadItem}
                onRetryItem={retryDownloadItem}
            />

            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />



            {renameFolder && (
                <RenameFolderModal
                    folderId={renameFolder.id}
                    currentName={renameFolder.name}
                    onRename={handleFolderRename}
                    onClose={() => setRenameFolder(null)}
                />
            )}

            {showNewFolderModal && (
                <div
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => { setShowNewFolderModal(false); setNewFolderName(""); }}
                >
                    <div
                        className="bg-telegram-surface border border-telegram-border rounded-xl w-full max-w-[360px] max-w-[90vw] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                            <h3 className="text-telegram-text font-medium flex items-center gap-2">
                                <Folder className="w-4 h-4 text-telegram-primary" />
                                New folder
                            </h3>
                            <button
                                onClick={() => { setShowNewFolderModal(false); setNewFolderName(""); }}
                                className="text-telegram-subtext hover:text-telegram-text transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4 space-y-3">
                            <div className="text-sm text-telegram-subtext">
                                Please enter a name for the new folder.
                            </div>
                            <input
                                autoFocus
                                type="text"
                                className="w-full bg-telegram-bg border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext/50 focus:outline-none focus:ring-2 focus:ring-telegram-primary/50 focus:border-telegram-primary/50 transition-all"
                                placeholder="Folder name"
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && submitCreate()}
                            />
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-telegram-border flex justify-end gap-2 bg-telegram-hover/10">
                            <button
                                onClick={() => { setShowNewFolderModal(false); setNewFolderName(""); }}
                                className="px-4 py-2 text-sm font-medium text-telegram-subtext hover:text-telegram-text bg-telegram-hover/50 hover:bg-telegram-hover rounded-lg transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitCreate}
                                className="px-4 py-2 text-sm font-medium text-white bg-telegram-primary hover:bg-telegram-primary/90 rounded-lg transition-colors cursor-pointer"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {renameFileTarget && (
                <RenameFileModal
                    fileName={renameFileTarget.name}
                    onRename={handleRenameSubmit}
                    onClose={() => setRenameFileTarget(null)}
                />
            )}

            {bulkShareLinks && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => setBulkShareLinks(null)}
                >
                    <div
                        className="bg-telegram-surface border border-telegram-border rounded-xl w-full max-w-[500px] max-w-[90vw] max-h-[70vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                            <h3 className="text-telegram-text font-medium flex items-center gap-2">
                                <Link className="w-5 h-5 text-telegram-primary" />
                                {bulkShareLinks.length} Share Link{bulkShareLinks.length !== 1 ? 's' : ''}
                            </h3>
                            <button onClick={() => setBulkShareLinks(null)} className="text-telegram-subtext hover:text-telegram-text">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {bulkShareLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 space-y-3">
                                <Loader2 className="w-8 h-8 text-telegram-primary animate-spin" />
                                <p className="text-sm text-telegram-subtext">Generating share links...</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                                {bulkShareLinks.map(({ file, link }) => {
                                    const isCopied = bulkShareCopied.has(link);
                                    return (
                                        <div
                                            key={file.id}
                                            className="p-3 rounded-lg bg-telegram-hover/30 border border-telegram-border/30 space-y-2"
                                        >
                                            <p className="text-xs font-semibold text-telegram-text truncate">{file.name}</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={link}
                                                    className="flex-1 bg-telegram-bg border border-telegram-border rounded-lg px-2.5 py-1.5 text-xs text-telegram-text focus:outline-none select-all truncate"
                                                />
                                                <button
                                                    onClick={() => handleCopyBulkLink(link)}
                                                    className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0 ${
                                                        isCopied
                                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                                            : 'bg-telegram-hover border-telegram-border text-telegram-text hover:bg-white/10'
                                                    }`}
                                                >
                                                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                                                    <button
                                                        onClick={() => nativeShareOrCopy(file.name, file.sizeStr, link, () => handleCopyBulkLink(link))}
                                                        className="px-2.5 py-1.5 rounded-lg bg-telegram-primary/20 hover:bg-telegram-primary/30 text-telegram-primary border border-telegram-primary/30 transition-all flex items-center justify-center flex-shrink-0"
                                                    >
                                                        <Share2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            onClick={() => setBulkShareLinks(null)}
                            className="w-full px-4 py-2.5 border-t border-telegram-border bg-telegram-hover/20 hover:bg-telegram-hover/40 text-telegram-text text-sm font-medium transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
