import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TelegramFile, TelegramFolder } from '../types';


export interface TrashedFolder {
    id: number;
    name: string;
    originalFolderId: number | null;
    deletedAt: string;
}

export type DriveTab = 'my-drive' | 'shared' | 'recent' | 'starred' | 'offline' | 'trash';
export type FileTypeFilter = 'all' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'document';
export type SortField = 'name' | 'size' | 'date';
export type SortDirection = 'asc' | 'desc';

export interface TrashedFile extends TelegramFile {
    originalFolderId: number | null;
    deletedAt: string;
}

interface DriveContextType {
    currentTab: DriveTab;
    setCurrentTab: (tab: DriveTab) => void;
    starredFiles: TelegramFile[];
    starFile: (file: TelegramFile) => void;
    unstarFile: (fileId: number) => void;
    isStarred: (fileId: number) => boolean;
    starredFolders: TelegramFolder[];
    starFolder: (folder: TelegramFolder) => void;
    unstarFolder: (folderId: number) => void;
    isFolderStarred: (folderId: number) => boolean;
    offlineFiles: TelegramFile[];
    makeAvailableOffline: (file: TelegramFile | number) => void;
    removeOfflineAccess: (fileId: number) => void;
    isOffline: (fileId: number) => boolean;
    getOfflineState: (fileId: number) => { isOffline: boolean; isReady: boolean; isDownloading: boolean; progress: number };
    recentFiles: TelegramFile[];
    addRecentFile: (file: TelegramFile) => void;
    trashedFiles: TrashedFile[];
    trashFile: (file: TelegramFile, originalFolderId: number | null) => void;
    restoreFile: (fileId: number) => void;
    deletePermanently: (fileId: number) => void;
    trashedFolders: TrashedFolder[];
    trashFolder: (folder: TelegramFolder) => void;
    restoreFolder: (folderId: number) => void;
    deleteFolderPermanently: (folderId: number) => void;
    emptyTrash: (
        deleteFn: (messageId: number, folderId: number | null) => Promise<void>,
        deleteFolderFn: (folderId: number, name: string) => Promise<void>
    ) => Promise<void>;
    isInfoPanelOpen: boolean;
    setIsInfoPanelOpen: (open: boolean) => void;
    fileTypeFilter: FileTypeFilter;
    setFileTypeFilter: (filter: FileTypeFilter) => void;
    activeFileId: number | null;
    setActiveFileId: (id: number | null) => void;
    folders: TelegramFolder[];
    setFolders: React.Dispatch<React.SetStateAction<TelegramFolder[]>>;
    sortField: SortField;
    setSortField: (field: SortField) => void;
    sortDirection: SortDirection;
    setSortDirection: (direction: SortDirection) => void;
}

const DriveContext = createContext<DriveContextType | undefined>(undefined);

export function DriveProvider({ children }: { children: ReactNode }) {
    const [currentTab, setCurrentTabState] = useState<DriveTab>('my-drive');
    const [starredFiles, setStarredFiles] = useState<TelegramFile[]>([]);
    const [starredFolders, setStarredFolders] = useState<TelegramFolder[]>([]);
    const [recentFiles, setRecentFiles] = useState<TelegramFile[]>([]);
    const [trashedFiles, setTrashedFiles] = useState<TrashedFile[]>([]);
    const [trashedFolders, setTrashedFolders] = useState<TrashedFolder[]>([]);
    const [isInfoPanelOpen, setIsInfoPanelOpen] = useState<boolean>(false);
    const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
    const [activeFileId, setActiveFileId] = useState<number | null>(null);
    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Load initial values from localStorage on mount
    useEffect(() => {
        try {
            const savedStarred = localStorage.getItem('drive_starred_files');
            if (savedStarred) {
                const parsed = JSON.parse(savedStarred);
                if (Array.isArray(parsed)) {
                    const sanitized = parsed.map((item: any) => {
                        if (typeof item === 'number') return { id: item, name: `File #${item}` } as TelegramFile;
                        if (item && typeof item === 'object') return { ...item, name: item.name || `File #${item.id || 'unknown'}` };
                        return null;
                    }).filter(Boolean) as TelegramFile[];
                    setStarredFiles(sanitized);
                }
            }

            const savedStarredFolders = localStorage.getItem('drive_starred_folders');
            if (savedStarredFolders) {
                const parsed = JSON.parse(savedStarredFolders);
                if (Array.isArray(parsed)) {
                    const sanitized = parsed.map((item: any) => {
                        if (typeof item === 'number') return { id: item, name: item === -999 ? 'Saved Messages' : `Folder #${item}` } as TelegramFolder;
                        if (item && typeof item === 'object') return { ...item, name: item.name || 'Folder' };
                        return null;
                    }).filter(Boolean) as TelegramFolder[];
                    setStarredFolders(sanitized);
                }
            }

            const savedRecent = localStorage.getItem('drive_recent_files');
            if (savedRecent) setRecentFiles(JSON.parse(savedRecent));

            const savedTrashed = localStorage.getItem('drive_trashed_files');
            if (savedTrashed) setTrashedFiles(JSON.parse(savedTrashed));

            const savedTrashedFolders = localStorage.getItem('drive_trashed_folders');
            if (savedTrashedFolders) setTrashedFolders(JSON.parse(savedTrashedFolders));

            const savedPanel = localStorage.getItem('drive_info_panel_open');
            if (savedPanel) setIsInfoPanelOpen(savedPanel === 'true');
        } catch (e) {
            console.error('Failed to load drive states:', e);
        }
    }, []);

    // Auto-clean expired items in trash (older than 30 days)
    useEffect(() => {
        const cleanExpiredTrash = async () => {
            const now = new Date().getTime();
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

            // Clean expired files
            const savedTrashedFiles = localStorage.getItem('drive_trashed_files');
            if (savedTrashedFiles) {
                try {
                    const filesList: TrashedFile[] = JSON.parse(savedTrashedFiles);
                    const expiredFiles = filesList.filter(f => {
                        const trashedTime = new Date(f.deletedAt).getTime();
                        return now - trashedTime > THIRTY_DAYS_MS;
                    });
                    if (expiredFiles.length > 0) {
                        for (const file of expiredFiles) {
                            try {
                                await invoke('cmd_delete_file', { messageId: file.id, folderId: file.originalFolderId === -999 ? null : file.originalFolderId });
                                await Promise.all([
                                    invoke('cmd_delete_image_thumbnail', { messageId: file.id, folderId: file.originalFolderId === -999 ? null : file.originalFolderId }).catch(() => {}),
                                    invoke('cmd_delete_preview_for_message', { messageId: file.id, folderId: file.originalFolderId === -999 ? null : file.originalFolderId }).catch(() => {}),
                                ]);
                            } catch (e) {
                                console.error(`Auto-delete expired file failed:`, e);
                            }
                        }
                        const remainingFiles = filesList.filter(f => !expiredFiles.some(ef => ef.id === f.id));
                        setTrashedFiles(remainingFiles);
                        localStorage.setItem('drive_trashed_files', JSON.stringify(remainingFiles));
                    }
                } catch (e) {
                    console.error("Failed to parse/clean expired files:", e);
                }
            }

            // Clean expired folders
            const savedTrashedFoldersList = localStorage.getItem('drive_trashed_folders');
            if (savedTrashedFoldersList) {
                try {
                    const foldersList: TrashedFolder[] = JSON.parse(savedTrashedFoldersList);
                    const expiredFolders = foldersList.filter(f => {
                        const trashedTime = new Date(f.deletedAt).getTime();
                        return now - trashedTime > THIRTY_DAYS_MS;
                    });
                    if (expiredFolders.length > 0) {
                        for (const folder of expiredFolders) {
                            try {
                                await invoke('cmd_delete_folder', { folderId: folder.id });
                            } catch (e) {
                                console.error(`Auto-delete expired folder failed:`, e);
                            }
                        }
                        const remainingFolders = foldersList.filter(f => !expiredFolders.some(ef => ef.id === f.id));
                        setTrashedFolders(remainingFolders);
                        localStorage.setItem('drive_trashed_folders', JSON.stringify(remainingFolders));
                    }
                } catch (e) {
                    console.error("Failed to parse/clean expired folders:", e);
                }
            }
        };

        cleanExpiredTrash();
    }, []);

    // Setters that persist to localStorage
    const setCurrentTab = (tab: DriveTab) => {
        setCurrentTabState(tab);
        setActiveFileId(null); // Clear selection on tab change
    };

    const starFile = useCallback((fileOrId: TelegramFile | number) => {
        setStarredFiles(prev => {
            const fileId = typeof fileOrId === 'number' ? fileOrId : fileOrId.id;
            if (prev.some(f => f?.id === fileId)) return prev;

            const fileObj: TelegramFile = typeof fileOrId === 'number'
                ? ({ id: fileId, name: `File #${fileId}` } as TelegramFile)
                : fileOrId;

            const updated = [fileObj, ...prev];
            localStorage.setItem('drive_starred_files', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const unstarFile = useCallback((fileId: number) => {
        setStarredFiles(prev => {
            const updated = prev.filter(f => f?.id !== fileId);
            localStorage.setItem('drive_starred_files', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const isStarred = useCallback((fileId: number) => {
        return starredFiles.some(f => f?.id === fileId);
    }, [starredFiles]);

    const starFolder = useCallback((folderOrId: TelegramFolder | number) => {
        setStarredFolders(prev => {
            const folderId = typeof folderOrId === 'number' ? folderOrId : folderOrId.id;
            if (prev.some(f => f?.id === folderId)) return prev;

            let folderObj: TelegramFolder;
            const found = folders.find(f => f.id === folderId);
            if (found) {
                folderObj = found;
            } else if (typeof folderOrId === 'object' && folderOrId !== null) {
                folderObj = folderOrId;
            } else {
                folderObj = { id: folderId, name: folderId === -999 ? 'Saved Messages' : `Folder #${folderId}` } as TelegramFolder;
            }

            const updated = [folderObj, ...prev];
            localStorage.setItem('drive_starred_folders', JSON.stringify(updated));
            return updated;
        });
    }, [folders]);

    const unstarFolder = useCallback((folderId: number) => {
        setStarredFolders(prev => {
            const updated = prev.filter(f => f?.id !== folderId);
            localStorage.setItem('drive_starred_folders', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const isFolderStarred = useCallback((folderId: number) => {
        return starredFolders.some(f => f?.id === folderId);
    }, [starredFolders]);

    const [offlineFiles, setOfflineFiles] = useState<TelegramFile[]>([]);

    useEffect(() => {
        try {
            const savedOffline = localStorage.getItem('drive_offline_files');
            if (savedOffline) {
                const parsed = JSON.parse(savedOffline);
                if (Array.isArray(parsed)) {
                    setOfflineFiles(parsed.filter(Boolean));
                }
            }
        } catch (e) {
            console.error('Failed to load offline files:', e);
        }
    }, []);

    const activeOfflineDownloadsRef = useRef<Set<number>>(new Set());

    const makeAvailableOffline = useCallback((fileOrId: TelegramFile | number) => {
        let targetFile: TelegramFile | null = null;

        setOfflineFiles(prev => {
            const fileId = typeof fileOrId === 'number' ? fileOrId : fileOrId.id;
            if (prev.some(f => f?.id === fileId)) return prev;

            targetFile = typeof fileOrId === 'number'
                ? ({ id: fileId, name: `File #${fileId}` } as TelegramFile)
                : fileOrId;

            const updated = [targetFile, ...prev];
            localStorage.setItem('drive_offline_files', JSON.stringify(updated));
            return updated;
        });

        // Trigger silent background download to save binary into offline storage
        const fileToDownload = typeof fileOrId === 'object' ? fileOrId : targetFile;
        if (fileToDownload && fileToDownload.id) {
            const fileId = fileToDownload.id;
            activeOfflineDownloadsRef.current.add(fileId);

            setOfflineProgressMap(prev => ({
                ...prev,
                [fileId]: { progress: 0, isReady: false }
            }));

            invoke<string>('cmd_get_offline_dir').then(offlineDir => {
                const safeName = (fileToDownload.name || `file_${fileId}`).replace(/[/\\?%*:|"<>]/g, '_');
                const savePath = `${offlineDir}/${fileId}_${safeName}`;
                invoke('cmd_download_file', {
                    req: {
                        transfer_id: `offline_${fileId}`,
                        save_path: savePath,
                        folder_id: fileToDownload.folder_id ?? null,
                        message_id: fileId,
                    }
                }).then(() => {
                    activeOfflineDownloadsRef.current.delete(fileId);
                    setOfflineProgressMap(prev => ({
                        ...prev,
                        [fileId]: { progress: 100, isReady: true }
                    }));
                }).catch(err => {
                    activeOfflineDownloadsRef.current.delete(fileId);
                    console.error('[DriveContext] Offline background caching failed for file:', fileToDownload.name, err);
                });
            }).catch(err => {
                activeOfflineDownloadsRef.current.delete(fileId);
                console.error('Failed to get offline directory:', err);
            });
        }
    }, []);

    const removeOfflineAccess = useCallback((fileId: number) => {
        activeOfflineDownloadsRef.current.delete(fileId);
        let fileName = '';
        setOfflineFiles(prev => {
            const target = prev.find(f => f?.id === fileId);
            if (target) fileName = target.name;
            const updated = prev.filter(f => f?.id !== fileId);
            localStorage.setItem('drive_offline_files', JSON.stringify(updated));
            return updated;
        });

        setOfflineProgressMap(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
        });

        if (fileId) {
            invoke('cmd_delete_offline_file', { fileId, fileName }).catch(() => {});
        }
    }, []);

    const [offlineProgressMap, setOfflineProgressMap] = useState<Record<number, { progress: number; isReady: boolean }>>({});

    // Listen to download-progress events from Rust backend for offline downloads
    useEffect(() => {
        let unlistenFn: (() => void) | null = null;
        listen<any>('download-progress', (event) => {
            const { id, percent } = event.payload || {};
            if (id && typeof id === 'string' && id.startsWith('offline_')) {
                const fileId = parseInt(id.replace('offline_', ''), 10);
                if (!isNaN(fileId)) {
                    if ((percent ?? 0) >= 100) {
                        activeOfflineDownloadsRef.current.delete(fileId);
                    }
                    setOfflineProgressMap(prev => ({
                        ...prev,
                        [fileId]: {
                            progress: percent ?? 0,
                            isReady: (percent ?? 0) >= 100
                        }
                    }));
                }
            }
        }).then(fn => {
            unlistenFn = fn;
        });

        return () => {
            if (unlistenFn) unlistenFn();
        };
    }, []);


    // Check disk for offline file readiness on load or when offline files change
    useEffect(() => {
        offlineFiles.forEach(file => {
            if (!file || !file.id) return;
            // Skip disk check for files currently downloading
            if (activeOfflineDownloadsRef.current.has(file.id)) return;

            invoke<string | null>('cmd_check_offline_file', {
                fileId: file.id,
                fileName: file.name
            }).then(path => {
                if (path && !activeOfflineDownloadsRef.current.has(file.id)) {
                    setOfflineProgressMap(prev => ({
                        ...prev,
                        [file.id]: { progress: 100, isReady: true }
                    }));
                }
            }).catch(() => {});
        });
    }, [offlineFiles]);

    const isOffline = useCallback((fileId: number) => {
        return offlineFiles.some(f => f?.id === fileId);
    }, [offlineFiles]);

    const getOfflineState = useCallback((fileId: number) => {
        const marked = offlineFiles.some(f => f?.id === fileId);
        if (!marked) {
            return { isOffline: false, isReady: false, isDownloading: false, progress: 0 };
        }
        const state = offlineProgressMap[fileId];
        if (state?.isReady || (state?.progress ?? 0) >= 100) {
            return { isOffline: true, isReady: true, isDownloading: false, progress: 100 };
        }
        return { isOffline: true, isReady: false, isDownloading: true, progress: state?.progress ?? 0 };
    }, [offlineFiles, offlineProgressMap]);

    const addRecentFile = useCallback((file: TelegramFile) => {
        setRecentFiles(prev => {
            // Remove if duplicate, add to top, and slice to max 20 items
            const filtered = prev.filter(f => f.id !== file.id);
            const updated = [file, ...filtered].slice(0, 20);
            localStorage.setItem('drive_recent_files', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const trashFile = useCallback((file: TelegramFile, originalFolderId: number | null) => {
        // Starred files should be unstarred when trashed
        unstarFile(file.id);
        removeOfflineAccess(file.id);

        setTrashedFiles(prev => {
            if (prev.some(f => f.id === file.id)) return prev;
            const trashed: TrashedFile = {
                ...file,
                originalFolderId,
                deletedAt: new Date().toISOString()
            };
            const updated = [trashed, ...prev];
            localStorage.setItem('drive_trashed_files', JSON.stringify(updated));
            return updated;
        });
    }, [unstarFile, removeOfflineAccess]);

    const restoreFile = useCallback((fileId: number) => {
        setTrashedFiles(prev => {
            const updated = prev.filter(f => f.id !== fileId);
            localStorage.setItem('drive_trashed_files', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const deletePermanently = useCallback((fileId: number) => {
        removeOfflineAccess(fileId);
        setTrashedFiles(prev => {
            const updated = prev.filter(f => f.id !== fileId);
            localStorage.setItem('drive_trashed_files', JSON.stringify(updated));
            return updated;
        });
        setRecentFiles(prev => {
            const updated = prev.filter(f => f.id !== fileId);
            localStorage.setItem('drive_recent_files', JSON.stringify(updated));
            return updated;
        });
    }, [removeOfflineAccess]);

    const trashFolder = useCallback((folder: TelegramFolder) => {
        setTrashedFolders(prev => {
            if (prev.some(f => f.id === folder.id)) return prev;
            const trashed: TrashedFolder = {
                id: folder.id,
                name: folder.name,
                originalFolderId: null,
                deletedAt: new Date().toISOString()
            };
            const updated = [trashed, ...prev];
            localStorage.setItem('drive_trashed_folders', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const restoreFolder = useCallback((folderId: number) => {
        setTrashedFolders(prev => {
            const updated = prev.filter(f => f.id !== folderId);
            localStorage.setItem('drive_trashed_folders', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const deleteFolderPermanently = useCallback((folderId: number) => {
        setTrashedFolders(prev => {
            const updated = prev.filter(f => f.id !== folderId);
            localStorage.setItem('drive_trashed_folders', JSON.stringify(updated));
            return updated;
        });
    }, []);

    const emptyTrash = useCallback(async (
        deleteFn: (messageId: number, folderId: number | null) => Promise<void>,
        deleteFolderFn: (folderId: number, name: string) => Promise<void>
    ) => {
        for (const file of trashedFiles) {
            try {
                await deleteFn(file.id, file.originalFolderId);
            } catch (e) {
                console.error("Failed to permanently delete", file.name, e);
            }
        }
        for (const folder of trashedFolders) {
            try {
                await deleteFolderFn(folder.id, folder.name);
            } catch (e) {
                console.error("Failed to permanently delete folder", folder.name, e);
            }
        }
        setTrashedFiles([]);
        localStorage.setItem('drive_trashed_files', JSON.stringify([]));
        setTrashedFolders([]);
        localStorage.setItem('drive_trashed_folders', JSON.stringify([]));
    }, [trashedFiles, trashedFolders]);

    const handleSetIsInfoPanelOpen = (open: boolean) => {
        setIsInfoPanelOpen(open);
        localStorage.setItem('drive_info_panel_open', String(open));
    };

    return (
        <DriveContext.Provider value={{
            currentTab,
            setCurrentTab,
            starredFiles,
            starFile,
            unstarFile,
            isStarred,
            starredFolders,
            starFolder,
            unstarFolder,
            isFolderStarred,
            offlineFiles,
            makeAvailableOffline,
            removeOfflineAccess,
            isOffline,
            getOfflineState,
            recentFiles,
            addRecentFile,
            trashedFiles,
            trashFile,
            restoreFile,
            deletePermanently,
            trashedFolders,
            trashFolder,
            restoreFolder,
            deleteFolderPermanently,
            emptyTrash,
            isInfoPanelOpen,
            setIsInfoPanelOpen: handleSetIsInfoPanelOpen,
            fileTypeFilter,
            setFileTypeFilter,
            activeFileId,
            setActiveFileId,
            folders,
            setFolders,
            sortField,
            setSortField,
            sortDirection,
            setSortDirection
        }}>
            {children}
        </DriveContext.Provider>
    );
}

export const useDrive = () => {
    const context = useContext(DriveContext);
    if (!context) throw new Error('useDrive must be used within a DriveProvider');
    return context;
};
