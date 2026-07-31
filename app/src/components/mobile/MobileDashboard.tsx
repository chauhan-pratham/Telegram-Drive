import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Folder, Download, RefreshCw, UploadCloud, Trash2, Pencil, Shield, ChevronDown, Share2, Link, Copy, X, Loader2, Wifi, Activity, Zap, Eye, EyeOff, Search, Plus, Star, LayoutGrid, List, FolderPlus, MoreVertical, HardDrive, Menu, ArrowUp, ArrowDown, LogOut, Settings, Clock, Users, ArrowLeft, AlertCircle, CheckCircle2, HelpCircle, Cloud, Sliders, Info, CheckSquare, FolderInput, FolderArchive, SlidersHorizontal } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BottomNavBar, MobileTab } from './BottomNavBar';
import { TouchFileList } from './TouchFileList';
import { FileTypeIcon } from '../shared/FileTypeIcon';
import { MobileFileThumbnail } from './MobileFileThumbnail';
import { ActionPopover, ActionItem } from './ActionPopover';
import { RenameFolderSheet } from './RenameFolderSheet';
import { MoveToFolderModal } from '../desktop/dashboard/MoveToFolderModal';
import { usePlatform } from '../../hooks/usePlatform';
import { useTelegramConnection } from '../../hooks/useTelegramConnection';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useFileDownload } from '../../hooks/useFileDownload';
import { useFileOperations } from '../../hooks/useFileOperations';
import { formatBytes, isMediaFile, isPdfFile, isImageFile, isExecutableFile, copyToClipboard } from '../../utils';
import { MediaPlayer } from '../desktop/dashboard/MediaPlayer';
import { PdfViewer } from '../desktop/dashboard/PdfViewer';
import { PreviewModal } from '../desktop/dashboard/PreviewModal';
import { useTheme } from '../../context/ThemeContext';
import { useDrive } from '../../context/DriveContext';
import { TelegramFile, TelegramFolder, BandwidthStats, FolderParticipantInfo } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { version as appVersion } from '../../../package.json';

export default function MobileDashboard({ onLogout }: { onLogout?: () => void }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [_activeSubTab, _setActiveSubTab] = useState<'my-drive' | 'computers'>('my-drive');
  const [activeHomeSubTab, setActiveHomeSubTab] = useState<'suggested' | 'activity'>('suggested');
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, _setCategoryFilter] = useState<'all' | 'folders' | 'photos' | 'videos' | 'audio' | 'pdfs' | 'archives'>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'document'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showSortFilterSheet, setShowSortFilterSheet] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [infoItem, setInfoItem] = useState<TelegramFile | TelegramFolder | null>(null);
  const { isStarred, isFolderStarred, starFile, unstarFile, starFolder, unstarFolder, starredFiles, starredFolders, offlineFiles, makeAvailableOffline, removeOfflineAccess, isOffline: _isOffline, getOfflineState, trashedFiles, trashedFolders, trashFile, trashFolder, restoreFile, restoreFolder, deletePermanently, deleteFolderPermanently, emptyTrash } = useDrive();
  const { isAndroid } = usePlatform();
  const { theme, setTheme, customThemes, activeCustomThemeId, setActiveCustomTheme } = useTheme();
  const { settings, updateSetting } = useSettings();

  // ── Total Storage Size Query ──────────────────────────────────────────────
  const { data: totalStorageSize = 0 } = useQuery<number>({
    queryKey: ['totalStorageSize'],
    queryFn: () => invoke<number>('cmd_get_total_files_size'),
    refetchInterval: 15000,
  });

  // ── Recently Opened Files Tracking ──────────────────────────────────────────
  const [recentOpenedMap, setRecentOpenedMap] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem('telegram_drive_recent_opened');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const markFileOpened = useCallback((fileId: number) => {
    setRecentOpenedMap(prev => {
      const next = { ...prev, [fileId]: Date.now() };
      try {
        localStorage.setItem('telegram_drive_recent_opened', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);



  // ── Drive Activity Logging System ──────────────────────────────────────────
  const [activityLogs, _setActivityLogs] = useState<Array<{ id: string; type: 'upload' | 'rename' | 'star' | 'share' | 'delete' | 'sync'; title: string; description: string; timestamp: number }>>(() => {
    try {
      const saved = localStorage.getItem('telegram_drive_activity_logs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'initial-sync',
        type: 'sync',
        title: 'Drive Synced',
        description: 'Connected to Telegram Cloud Infrastructure',
        timestamp: Date.now() - 60000,
      },
    ];
  });

  // ── Pull-to-Refresh Gesture Logic ──────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (mainScrollRef.current && mainScrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !mainScrollRef.current || mainScrollRef.current.scrollTop > 0) return;
    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - touchStartY.current);
    if (distance > 0 && distance < 120) {
      setPullDistance(distance);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    if (pullDistance > 60 && !isSyncing) {
      toast.info('Syncing drive folders...', { id: 'pull-sync' });
      await handleSyncFolders();
    }
    setPullDistance(0);
    setIsPulling(false);
  };

  // ── Android deep-link listener (https://t.me/ links) ──────────────────
  useEffect(() => {
    if (!isAndroid) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await onOpenUrl((urls) => {
          if (urls.length > 0) {
            const url = urls[0];
            toast.success(`Telegram link received: ${url}`, { duration: 5000 });
          }
        });
      } catch (e) {
        console.warn('[DeepLink] Failed to register listener:', e);

      }
    })();
    return () => { unlisten?.(); };
  }, [isAndroid]);

  // ── Android share-received listener (warm start) ──────────────────────
  useEffect(() => {
    if (!isAndroid) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<{ count: number }>('share-received', (event) => {
          const count = event.payload?.count ?? 0;
          if (count > 0) {
            const label = count === 1 ? '1 file' : `${count} files`;
            toast.success(`${label} received! Ready to upload.`, { duration: 4000 });
          }
        });
      } catch (e) {
        console.warn('[Share] Failed to register listener:', e);
      }
    })();
    return () => { unlisten?.(); };
  }, [isAndroid]);

  // ── Android cold-start share check ────────────────────────────────────
  useEffect(() => {
    if (!isAndroid) return;
    (async () => {
      try {
        const count = await invoke<number>('cmd_get_pending_share_count');
        if (count > 0) {
          const label = count === 1 ? '1 file' : `${count} files`;
          toast.success(`${label} received! Ready to upload.`, { duration: 4000 });
        }
      } catch (e) {
        // Best-effort; JNI cache may not be ready on very early mount
        console.warn('[Share] Cold-start check failed (may be expected):', e);
      }
    })();
  }, [isAndroid]);

  // Sync proxy settings to backend whenever they change
  useEffect(() => {
    const applyProxy = async () => {
      try {
        await invoke('cmd_apply_proxy_settings', {
          enabled: settings.proxyEnabled,
          proxyType: settings.proxyType,
          host: settings.proxyHost,
          port: settings.proxyPort,
          username: settings.proxyUsername,
          password: settings.proxyPassword,
        });
      } catch {
        // best-effort sync
      }
    };
    applyProxy();
  }, [
    settings.proxyEnabled, settings.proxyType, settings.proxyHost,
    settings.proxyPort, settings.proxyUsername, settings.proxyPassword,
  ]);

  const logoutHandler = useMemo(() => onLogout || (() => {}), [onLogout]);

  const {
    store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
    handleLogout: _handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete: _handleFolderDelete,
    handleFolderRename, handleFolderToggleVisibility, handleExportFolderInvite,
    mutatingFolderIds
  } = useTelegramConnection(logoutHandler);

  const mainScrollRef = useRef<HTMLElement>(null);

  const { handleManualUpload, handleFolderUpload } = useFileUpload(activeFolderId, store);
  const { queueDownload, queueBulkDownload } = useFileDownload(store);

  const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);
  const [pdfFile, setPdfFile] = useState<TelegramFile | null>(null);
  const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
  const [uploadingCacheFiles, setUploadingCacheFiles] = useState<Set<string>>(new Set());
  const transferIdCounter = useRef(0);

  // ── Connection diagnostics state ──────────────────────────────────────
  const [checkingLatency, setCheckingLatency] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [user, setUser] = useState<{ first_name: string; last_name?: string; username?: string; photo_base64?: string } | null>(null);

  useEffect(() => {
    if (isConnected) {
      invoke<{ first_name: string; last_name?: string; username?: string; photo_base64?: string } | null>('cmd_get_me')
        .then(res => setUser(res))
        .catch(err => console.warn('[cmd_get_me] Failed to fetch profile photo:', err));
    }
  }, [isConnected]);

  const { data: bandwidth } = useQuery({
    queryKey: ['bandwidth'],
    queryFn: () => invoke<BandwidthStats>('cmd_get_bandwidth'),
    refetchInterval: (activeTab as string) === 'settings' ? 5000 : false,
  });

  const handleCheckLatency = useCallback(async () => {
    setCheckingLatency(true);
    setLatencyMs(null);
    try {
      const ms = await invoke<number>('cmd_check_latency');
      setLatencyMs(ms);
      if (ms >= 0) {
        const emoji = ms < 100 ? '🟢' : ms < 250 ? '🟡' : '🔴';
        toast.success(`${emoji} Ping: ${ms}ms to Telegram DC`);
      } else {
        toast.error('Unable to reach Telegram servers');
      }
    } catch (e) {
      console.warn('Ping check failed:', e);
      toast.error('Unable to reach Telegram servers');
      setLatencyMs(-1);
    } finally {
      setCheckingLatency(false);
    }
  }, []);


  // ── Android cached shared files ───────────────────────────────────────
  interface CachedFileEntry {
    uri: string;
    cached_path: string;
    file_name: string;
    file_size: number;
  }

  const { data: cachedFiles = [], refetch: refetchCachedFiles } = useQuery({
    queryKey: ['cached-shared-files'],
    queryFn: () => invoke<CachedFileEntry[]>('cmd_get_cached_shared_files'),
    enabled: isAndroid,
  });

  const handleUploadCachedFile = useCallback(async (entry: CachedFileEntry) => {
    setUploadingCacheFiles(prev => {
      const next = new Set(prev);
      next.add(entry.uri);
      return next;
    });

    const tid = ++transferIdCounter.current;
    try {
      // 1. Initiate transfer UI
      queryClient.setQueryData<any[]>(['uploadQueue'], (prev = []) => [
        ...prev,
        {
          id: tid,
          name: entry.file_name,
          size: entry.file_size,
          progress: 0,
          status: 'running',
          speed: 0,
          eta: 0,
          folderId: activeFolderId,
        }
      ]);

      // 2. Perform background upload command
      await invoke('cmd_upload_cached_file', {
        folderId: activeFolderId,
        cachedPath: entry.cached_path,
        fileName: entry.file_name,
      });

      // 3. Mark completed & cleanup
      queryClient.setQueryData<any[]>(['uploadQueue'], (prev = []) =>
        prev.map(i => i.id === tid ? { ...i, status: 'completed', progress: 100 } : i)
      );
      toast.success(`Uploaded ${entry.file_name} successfully!`);
      await invoke('cmd_delete_cached_shared_file', { uri: entry.uri });
      refetchCachedFiles();
    } catch (e) {
      queryClient.setQueryData<any[]>(['uploadQueue'], (prev = []) =>
        prev.map(i => i.id === tid ? { ...i, status: 'failed', error: String(e) } : i)
      );
      toast.error(`Upload failed: ${e}`);
    } finally {
      setUploadingCacheFiles(prev => {
        const next = new Set(prev);
        next.delete(entry.uri);
        return next;
      });
    }
  }, [activeFolderId, refetchCachedFiles, queryClient]);

  const handleClearCachedSharedFiles = useCallback(async () => {
    try {
      for (const entry of cachedFiles) {
        await invoke('cmd_delete_cached_shared_file', { uri: entry.uri });
      }
      refetchCachedFiles();
      toast.success('Successfully cleared cache');
    } catch (e) {
      toast.error(`Failed to clear: ${e}`);
    }
  }, [cachedFiles, refetchCachedFiles]);

  const { data: allFiles = [], isLoading } = useQuery({
    queryKey: ['files', activeFolderId],
    queryFn: async () => {
      let accumulatedFiles: any[] = [];
      const actualFolderId = (activeFolderId === null || activeFolderId === -999) ? null : activeFolderId;

      const unlisten = await listen<any>('folder-load-chunk', (event) => {
        const payload = event.payload;
        if (payload.folderId === actualFolderId) {
          const newChunk = payload.files.map((f: any) => ({
            ...f,
            sizeStr: formatBytes(f.size),
            type: f.icon_type || (f.name.endsWith('/') ? 'folder' : 'file')
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
    enabled: !!store,
  });

  // Recently accessed/opened files sorted by last opened timestamp or fallback to date_added
  const recentFiles = useMemo(() => {
    return [...allFiles].sort((a, b) => {
      const timeA = recentOpenedMap[a.id] || (a.date_added ? new Date(a.date_added).getTime() : 0);
      const timeB = recentOpenedMap[b.id] || (b.date_added ? new Date(b.date_added).getTime() : 0);
      return timeB - timeA;
    });
  }, [allFiles, recentOpenedMap]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [fileRenames, setFileRenames] = useState<Map<number, string>>(new Map());
  const { handleBulkDelete, handleBulkDownload, handleBulkMove } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, allFiles, queueBulkDownload);

  // Folder action menu state (replaces swipe-to-reveal)
  const [folderActionMenu, setFolderActionMenu] = useState<TelegramFolder | null>(null);
  const [actionMenuFile, setActionMenuFile] = useState<TelegramFile | null>(null);
  const [renameFolder, setRenameFolder] = useState<{ id: number; name: string } | null>(null);
  const [showInlineFolderSearch, setShowInlineFolderSearch] = useState(false);

  const [makePublicFolder, setMakePublicFolder] = useState<{ id: number; name: string; defaultUsername: string } | null>(null);
  const [renameFile, setRenameFile] = useState<{ id: number; currentName: string } | null>(null);
  const [showCreateFolderSheet, setShowCreateFolderSheet] = useState(false);
  const [privateShareModalFile, setPrivateShareModalFile] = useState<TelegramFile | null>(null);
  const [folderInviteWarningModal, setFolderInviteWarningModal] = useState<TelegramFolder | null>(null);
  const [trashedActionItem, setTrashedActionItem] = useState<{ id: number; name: string; isFolder: boolean } | null>(null);

  const handleFolderVisibilityToggle = useCallback(async (folder: TelegramFolder) => {
    const isPublic = folder.is_public || !!folder.username;
    if (isPublic) {
      try {
        await handleFolderToggleVisibility(folder.id, false);
      } catch { /* error already toasted */ }
    } else {
      const defaultUsername = folder.name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      setMakePublicFolder({ id: folder.id, name: folder.name, defaultUsername });
    }
  }, [handleFolderToggleVisibility]);

  const handleFolderShareInvite = useCallback((folder: TelegramFolder) => {
    setFolderInviteWarningModal(folder);
  }, []);

  const confirmFolderShareInvite = useCallback(async (folder: TelegramFolder) => {
    try {
      const info = await handleExportFolderInvite(folder.id);
      try {
        await copyToClipboard(info.link);
        toast.success(`Invite link copied: ${info.link}`);
      } catch (e) {
        toast.error(`Failed to copy to clipboard: ${e}`);
      }
    } catch { /* backend error already toasted in hook */ }
  }, [handleExportFolderInvite]);

  const buildFolderActions = useCallback((folder: TelegramFolder): ActionItem[] => {
    const isSavedMessages = folder.id === -999 || folder.name === 'Saved Messages';
    const isPublic = folder.is_public || !!folder.username;
    const folderStarred = isFolderStarred(folder.id);

    const actions: ActionItem[] = [
      {
        label: folderStarred ? 'Remove from Starred' : 'Add to Starred',
        icon: <Star className={`w-4 h-4 ${folderStarred ? 'text-amber-400 fill-amber-400' : ''}`} />,
        onClick: () => {
          setFolderActionMenu(null);
          if (folderStarred) {
            unstarFolder(folder.id);
            toast.success(`Removed "${folder.name}" from Starred`);
          } else {
            starFolder(folder);
            toast.success(`Added "${folder.name}" to Starred`);
          }
        },
      },
    ];

    if (!isSavedMessages) {
      actions.push(
        {
          label: 'Download Folder',
          icon: <Download className="w-4 h-4 text-green-400" />,
          onClick: () => {
            setFolderActionMenu(null);
            invoke('cmd_zip_and_download_folder', { folderId: folder.id, folderName: folder.name })
              .then(() => toast.success(`Downloading "${folder.name}.zip"...`))
              .catch(err => toast.error(`Failed to download folder: ${err}`));
          },
        },
        {
          label: 'Rename',
          icon: <Pencil className="w-4 h-4" />,
          onClick: () => {
            setFolderActionMenu(null);
            setRenameFolder({ id: folder.id, name: folder.name });
          },
        },
        {
          label: isPublic ? 'Make Private' : 'Make Public',
          icon: isPublic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />,
          onClick: () => handleFolderVisibilityToggle(folder),
        },
        {
          label: 'Copy Invite Link',
          icon: <Link className="w-4 h-4" />,
          onClick: () => handleFolderShareInvite(folder),
        },
        {
          label: 'Move to Folder',
          icon: <FolderInput className="w-4 h-4 text-amber-400" />,
          onClick: () => {
            setFolderActionMenu(null);
            setSelectedIds([folder.id]);
            setShowMoveModal(true);
          },
        },
        {
          label: 'Details',
          icon: <Info className="w-4 h-4 text-telegram-primary" />,
          onClick: () => {
            setFolderActionMenu(null);
            setInfoItem(folder);
          },
        },
        {
          label: 'Delete',
          icon: <Trash2 className="w-4 h-4" />,
          onClick: () => {
            setFolderActionMenu(null);
            trashFolder(folder);
            toast.success(`Moved folder "${folder.name}" to Trash`);
          },
          destructive: true,
        }
      );
    } else {
      actions.push({
        label: 'Details',
        icon: <Info className="w-4 h-4 text-telegram-primary" />,
        onClick: () => {
          setFolderActionMenu(null);
          setInfoItem(folder);
        },
      });
    }

    return actions;
  }, [isFolderStarred, starFolder, unstarFolder, trashFolder, handleFolderVisibilityToggle, handleFolderShareInvite]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.length === allFiles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFiles.map(f => f.id));
    }
  }, [selectedIds.length, allFiles]);

  const handleClearSelection = useCallback(() => setSelectedIds([]), []);

  const handleToggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const handleDownload = useCallback((file: TelegramFile) => {
    queueDownload(file.id, file.name, activeFolderId);
  }, [queueDownload, activeFolderId]);

  const handleDeleteFile = useCallback((file: TelegramFile) => {
    trashFile(file, file.folder_id ?? activeFolderId);
    setSelectedIds(prev => prev.filter(id => id !== file.id));
    toast.success(`Moved "${file.name}" to Trash`);
  }, [trashFile, activeFolderId]);

  const handlePreview = useCallback((file: TelegramFile) => {
    markFileOpened(file.id);
    if (isExecutableFile(file.name, file.mime_type)) {
      setPreviewFile(file);
    } else if (isMediaFile(file.name, file.mime_type)) {
      setPlayingFile(file);
    } else if (isPdfFile(file.name, file.mime_type)) {
      setPdfFile(file);
    } else {
      setPreviewFile(file);
    }
  }, [markFileOpened]);

  const handleRenameFile = useCallback((file: TelegramFile) => {
    const currentName = fileRenames.get(file.id) || file.name;
    setRenameFile({ id: file.id, currentName });
  }, [fileRenames]);


  const handleCopyTelegramLink = useCallback((file: TelegramFile) => {
    const folder = folders.find(f => f.id === file.folder_id) || folders.find(f => f.id === activeFolderId);
    const username = folder?.username || (folder as any)?.chat?.username || (folder as any)?.channel?.username;
    
    if (username) {
      const url = `https://t.me/${username}/${file.id}`;
      navigator.clipboard.writeText(url).then(() => {
        toast.success('Public Telegram link copied');
      }).catch(() => {
        toast.error('Failed to copy link');
      });
    } else {
      toast.info('File links are disabled for private folders. Make the folder public to generate a shareable link.');
    }
  }, [folders, activeFolderId]);

  const buildSuggestedFileActions = useCallback((file: TelegramFile): ActionItem[] => {
    const isFileStarred = isStarred(file.id);
    const folder = folders.find(f => f.id === file.folder_id) || folders.find(f => f.id === activeFolderId);
    const username = folder?.username || (folder as any)?.chat?.username || (folder as any)?.channel?.username;

    const actions: ActionItem[] = [
      {
        label: 'Preview',
        icon: <Eye className="w-4 h-4" />,
        onClick: () => {
          setActionMenuFile(null);
          handlePreview(file);
        },
      },
      {
        label: 'Download',
        icon: <Download className="w-4 h-4" />,
        onClick: () => {
          setActionMenuFile(null);
          handleDownload(file);
        },
      },
      {
        label: isFileStarred ? 'Remove from Starred' : 'Add to Starred',
        icon: <Star className={`w-4 h-4 ${isFileStarred ? 'text-amber-400 fill-amber-400' : ''}`} />,
        onClick: () => {
          setActionMenuFile(null);
          if (isFileStarred) {
            unstarFile(file.id);
            toast.success(`Removed "${file.name}" from Starred`);
          } else {
            starFile(file);
            toast.success(`Added "${file.name}" to Starred`);
          }
        },
      },
      (() => {
        const offState = getOfflineState(file.id);
        const label = offState.isDownloading 
          ? `Downloading (${offState.progress}%)`
          : (offState.isReady ? 'Remove offline access' : 'Make available offline');

        return {
          label,
          icon: offState.isDownloading ? (
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
          ) : (
            <CheckCircle2 className={`w-4 h-4 ${offState.isReady ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
          ),
          onClick: () => {
            setActionMenuFile(null);
            if (offState.isOffline) {
              removeOfflineAccess(file.id);
              toast.success(`Removed offline access for "${file.name}"`);
            } else {
              makeAvailableOffline(file);
              toast.info(`Downloading "${file.name}" for offline access...`);
            }
          },
        };
      })(),
    ];

    if (username) {
      actions.push({
        label: 'Copy Telegram Link',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => {
          setActionMenuFile(null);
          handleCopyTelegramLink(file);
        },
      });
    }

    actions.push(
      {
        label: 'Rename',
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => {
          setActionMenuFile(null);
          handleRenameFile(file);
        },
      },
      {
        label: 'Move to Folder',
        icon: <FolderInput className="w-4 h-4 text-amber-400" />,
        onClick: () => {
          setActionMenuFile(null);
          setSelectedIds([file.id]);
          setShowMoveModal(true);
        },
      },
      {
        label: 'Details',
        icon: <Info className="w-4 h-4 text-telegram-primary" />,
        onClick: () => {
          setActionMenuFile(null);
          setInfoItem(file);
        },
      },
      {
        label: 'Delete',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: () => {
          setActionMenuFile(null);
          handleDeleteFile(file);
        },
        destructive: true,
      }
    );

    return actions;
  }, [isStarred, starFile, unstarFile, handlePreview, handleDownload, handleCopyTelegramLink, handleRenameFile, handleDeleteFile, folders, activeFolderId]);

  const handleTabChange = useCallback((tab: MobileTab) => {
    setActiveTab(tab);
    if (tab !== 'files') {
      setActiveFolderId(null);
    }
  }, [setActiveFolderId]);

  const displayFiles = useMemo(() => {
    const trashedIds = new Set(trashedFiles.map(tf => tf.id));
    const active = allFiles.filter(f => !trashedIds.has(f.id));
    if (fileRenames.size === 0) return active;
    return active.map(f =>
      fileRenames.has(f.id) ? { ...f, name: fileRenames.get(f.id)! } : f
    );
  }, [allFiles, fileRenames, trashedFiles]);

  const displayFolders = useMemo(() => {
    const trashedFolderIds = new Set(trashedFolders.map(tf => tf.id));
    const activeF = folders.filter(f => !trashedFolderIds.has(f.id) && (activeFolderId === null ? (!f.parent_id || f.parent_id === 0) : f.parent_id === activeFolderId));
    if (activeFolderId === null) {
      const virtualFolder: TelegramFolder = {
        id: -999,
        name: 'Saved Messages',
      };
      return [virtualFolder, ...activeF];
    }
    return activeF;
  }, [folders, activeFolderId, trashedFolders]);

  const currentFolderName = useMemo(() => {
    if (activeFolderId === null) return 'My Drive';
    if (activeFolderId === -999) return 'Saved Messages';
    const f = folders.find(folder => folder.id === activeFolderId);
    return f ? f.name : 'Folder';
  }, [activeFolderId, folders]);

  const activeFolderObj = useMemo(() => {
    if (activeFolderId === null || activeFolderId === -999) return null;
    return folders.find(folder => folder.id === activeFolderId) || null;
  }, [activeFolderId, folders]);

  const filteredFiles = useMemo(() => {
    let list = displayFiles;

    // In Files tab, scope files strictly to the active folder
    if (activeTab === 'files') {
      if (activeFolderId === null) {
        // At My Drive root, files belong inside 'Saved Messages' (-999) or subfolders.
        // Return empty array unless searching or filtering by category.
        if (!searchQuery.trim() && categoryFilter === 'all') {
          return [];
        }
      } else {
        const targetFolderId = activeFolderId === -999 ? null : activeFolderId;
        list = list.filter(f => {
          const fileFolder = f.folder_id ?? null;
          if (targetFolderId === null) {
            return fileFolder === null || fileFolder === -999;
          }
          return fileFolder === targetFolderId;
        });
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(f => f.name.toLowerCase().includes(q));
    }
    if (categoryFilter === 'photos') list = list.filter(f => isImageFile(f.name, f.mime_type));
    else if (categoryFilter === 'videos') list = list.filter(f => isMediaFile(f.name, f.mime_type));
    else if (categoryFilter === 'pdfs') list = list.filter(f => isPdfFile(f.name, f.mime_type));
    else if (categoryFilter === 'audio') list = list.filter(f => f.name.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i));
    else if (categoryFilter === 'archives') list = list.filter(f => f.name.match(/\.(zip|rar|7z|tar|gz)$/i));
    return list;
  }, [displayFiles, activeTab, activeFolderId, searchQuery, categoryFilter]);

  const sortedAndFilteredFiles = useMemo(() => {
    let list = [...filteredFiles];

    if (fileTypeFilter !== 'all') {
      if (fileTypeFilter === 'pdf') list = list.filter(f => isPdfFile(f.name, f.mime_type));
      else if (fileTypeFilter === 'image') list = list.filter(f => isImageFile(f.name, f.mime_type));
      else if (fileTypeFilter === 'video') list = list.filter(f => isMediaFile(f.name, f.mime_type));
      else if (fileTypeFilter === 'audio') list = list.filter(f => !!f.name.match(/\.(mp3|wav|flac|ogg|m4a|aac)$/i));
      else if (fileTypeFilter === 'archive') list = list.filter(f => !!f.name.match(/\.(zip|rar|7z|tar|gz)$/i));
      else if (fileTypeFilter === 'document') list = list.filter(f => !isImageFile(f.name, f.mime_type) && !isMediaFile(f.name, f.mime_type) && !f.name.match(/\.(zip|rar|7z|tar|gz)$/i));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      } else if (sortField === 'date') {
        cmp = (a.created_at || '').localeCompare(b.created_at || '');
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [filteredFiles, fileTypeFilter, sortField, sortOrder]);

  const suggestedFiles = useMemo(() => {
    const list = [...filteredFiles];
    list.sort((a, b) => {
      const timeA = recentOpenedMap[a.id] || 0;
      const timeB = recentOpenedMap[b.id] || 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.id - a.id;
    });
    return list;
  }, [filteredFiles, recentOpenedMap]);

  const handleMobileBulkDelete = useCallback(() => {
    const filesToTrash = allFiles.filter(f => selectedIds.includes(f.id));
    const foldersToTrash = displayFolders.filter(f => selectedIds.includes(f.id) && f.id !== -999);
    
    filesToTrash.forEach(f => trashFile(f, f.folder_id ?? activeFolderId));
    foldersToTrash.forEach(f => trashFolder(f));
    
    setSelectedIds([]);
    const count = filesToTrash.length + foldersToTrash.length;
    toast.success(`Moved ${count} item${count > 1 ? 's' : ''} to Trash`);
  }, [allFiles, displayFolders, selectedIds, trashFile, trashFolder, activeFolderId]);

  return (
    <div className="absolute inset-0 flex flex-col bg-telegram-bg text-telegram-text overflow-hidden select-none font-sans">
      {/* Top Header Bar: Selection Action Header OR Settings Header OR Search & Controls */}
      {selectedIds.length > 0 ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/98 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClearSelection}
              className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
              title="Clear selection"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-telegram-text tracking-tight">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSelectAll}
              className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
              title="Select all"
            >
              <CheckSquare className="w-5 h-5" />
            </button>

            <button
              onClick={handleBulkDownload}
              className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
              title="Download selected"
            >
              <Download className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowMoveModal(true)}
              className="p-2 rounded-full hover:bg-white/10 text-amber-400 hover:text-amber-300 transition cursor-pointer"
              title="Move selected to folder"
            >
              <FolderInput className="w-5 h-5" />
            </button>

            <button
              onClick={handleMobileBulkDelete}
              className="p-2 rounded-full hover:bg-white/10 text-red-400 hover:bg-red-500/20 transition cursor-pointer"
              title="Delete selected"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </header>
      ) : (activeTab as string) === 'offline' ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-sm min-h-[60px]">
          {showInlineFolderSearch ? (
            <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2 w-full animate-in fade-in">
              <button
                onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); }}
                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Close search"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                type="text"
                autoFocus
                placeholder="Search offline files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text cursor-pointer rounded-full hover:bg-white/10 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); setActiveTab('files'); }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
                  title="Back to Drive"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-telegram-text tracking-tight">Offline</h2>
              </div>
              <button
                onClick={() => setShowInlineFolderSearch(true)}
                className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                title="Search offline files"
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}
        </header>
      ) : (activeTab as string) === 'trash' ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-sm min-h-[60px]">
          {showInlineFolderSearch ? (
            <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2 w-full animate-in fade-in">
              <button
                onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); }}
                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Close search"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                type="text"
                autoFocus
                placeholder="Search trash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text cursor-pointer rounded-full hover:bg-white/10 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); setActiveTab('files'); }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
                  title="Back to Drive"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-telegram-text tracking-tight">Trash</h2>
              </div>
              <button
                onClick={() => setShowInlineFolderSearch(true)}
                className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                title="Search trash"
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}
        </header>
      ) : (activeTab as string) === 'recent' ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-sm min-h-[60px]">
          {showInlineFolderSearch ? (
            <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2 w-full animate-in fade-in">
              <button
                onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); }}
                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Close search"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                type="text"
                autoFocus
                placeholder="Search recent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text cursor-pointer rounded-full hover:bg-white/10 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); setActiveTab('files'); }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
                  title="Back to Drive"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-telegram-text tracking-tight">Recent</h2>
              </div>
              <button
                onClick={() => setShowInlineFolderSearch(true)}
                className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                title="Search recent"
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}
        </header>
      ) : (activeTab as string) === 'uploads' ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-sm min-h-[60px]">
          {showInlineFolderSearch ? (
            <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2 w-full animate-in fade-in">
              <button
                onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); }}
                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Close search"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                type="text"
                autoFocus
                placeholder="Search uploads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text cursor-pointer rounded-full hover:bg-white/10 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); setActiveTab('files'); }}
                  className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
                  title="Back to Drive"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-telegram-text tracking-tight">Uploads</h2>
              </div>
              <button
                onClick={() => setShowInlineFolderSearch(true)}
                className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                title="Search uploads"
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}
        </header>
      ) : (activeTab as string) === 'settings' ? (
        <header className="px-4 py-3 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md border-b border-telegram-border/20 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('files')}
              className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95"
              title="Back to Drive"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold text-telegram-text tracking-tight">Settings</h2>
          </div>
        </header>
      ) : (activeTab === 'files' && activeFolderId !== null) ? (
        /* Google Drive Folder View Header */
        <header className="px-4 pt-3 pb-2 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md space-y-2 border-b border-telegram-border/20 min-h-[60px]">
          {showInlineFolderSearch ? (
            <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2 w-full animate-in fade-in">
              <button
                onClick={() => { setSearchQuery(''); setShowInlineFolderSearch(false); }}
                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer shrink-0"
                title="Close search"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <input
                type="text"
                autoFocus
                placeholder="Search folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text cursor-pointer rounded-full hover:bg-white/10 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  onClick={() => setActiveFolderId(null)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-telegram-text cursor-pointer transition active:scale-95 shrink-0"
                  title="Go back to My Drive"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-telegram-text truncate tracking-tight">
                  {currentFolderName}
                </h2>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowInlineFolderSearch(true)}
                  className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                  title="Search in folder"
                >
                  <Search className="w-5 h-5" />
                </button>

                {activeFolderObj && (
                  <button
                    onClick={() => setFolderActionMenu(activeFolderObj)}
                    className="p-2 rounded-full hover:bg-white/10 text-telegram-subtext hover:text-telegram-text transition cursor-pointer"
                    title="Folder options"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sub-Header Sort & Layout Controls */}
          <div className="flex items-center justify-between px-1 text-xs pt-1">
            <button
              onClick={() => setShowSortFilterSheet(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-telegram-surface border border-telegram-border/40 font-semibold text-telegram-text hover:text-telegram-primary transition cursor-pointer text-xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-telegram-primary" />
              <span className="capitalize">{sortField}</span>
              {fileTypeFilter !== 'all' && (
                <span className="px-1.5 py-0.2 rounded-full bg-telegram-primary/20 text-telegram-primary text-[10px]">
                  {fileTypeFilter}
                </span>
              )}
              <ArrowUp className={`w-3 h-3 transition-transform duration-200 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
            </button>

            {/* View Mode Switcher Pill [ ≡ | 🔲 ] */}
            <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="px-4 pt-3 pb-2 sticky top-0 z-40 bg-telegram-bg/95 backdrop-blur-md space-y-2.5 border-b border-telegram-border/20">
          {/* 1. Floating Pill Search Bar */}
          <div className="flex items-center gap-3 bg-telegram-surface border border-telegram-border/40 shadow-md rounded-full px-4 py-2">
            <button onClick={() => setShowDrawer(true)} className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition cursor-pointer" title="Navigation Menu">
              <Menu className="w-5 h-5" />
            </button>
            <input
              type="text"
              placeholder="Search in Drive"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs sm:text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-1 text-telegram-subtext hover:text-telegram-text">
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Live Proxy Status Badge */}
            {settings.proxyEnabled && settings.proxyLiveStateEnabled && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#18151f] border border-white/10 text-[10px] text-white/70 font-mono shrink-0 shadow-inner"
                title={latencyMs !== null && latencyMs >= 0 ? `${latencyMs}ms latency` : 'Proxy offline'}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${latencyMs === null ? 'bg-amber-400 animate-pulse' : latencyMs >= 0 ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`} />
                <span>{latencyMs === null ? 'Proxy' : latencyMs >= 0 ? `${latencyMs}ms` : 'Off'}</span>
              </div>
            )}

            {/* Profile Avatar Icon */}
            <div
              onClick={() => setShowProfileSheet(true)}
              className="w-7 h-7 rounded-full bg-telegram-primary/20 text-telegram-primary font-bold text-xs flex items-center justify-center ring-2 ring-emerald-400 shrink-0 shadow-sm overflow-hidden cursor-pointer hover:opacity-90 transition"
              title={user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Account Profile'}
            >
              {user?.photo_base64 ? (
                <img src={user.photo_base64} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'
              )}
            </div>
          </div>

          {/* 2. Top Sub-Tabs Row (Only for Home or Files) */}
          {activeTab === 'home' && (
            <div className="grid grid-cols-2 text-center text-xs sm:text-sm font-semibold pt-1 border-b border-telegram-border/10">
              <button
                onClick={() => setActiveHomeSubTab('suggested')}
                className={`pb-2 flex flex-col items-center transition-all cursor-pointer ${
                  activeHomeSubTab === 'suggested'
                    ? 'text-telegram-primary font-bold'
                    : 'text-telegram-subtext hover:text-telegram-text'
                }`}
              >
                <span>Suggested</span>
                <div className={`h-1 rounded-full transition-all duration-200 mt-1.5 ${
                  activeHomeSubTab === 'suggested' ? 'w-14 bg-telegram-primary shadow-xs' : 'w-0 bg-transparent'
                }`} />
              </button>

              <button
                onClick={() => setActiveHomeSubTab('activity')}
                className={`pb-2 flex flex-col items-center transition-all cursor-pointer ${
                  activeHomeSubTab === 'activity'
                    ? 'text-telegram-primary font-bold'
                    : 'text-telegram-subtext hover:text-telegram-text'
                }`}
              >
                <span>Activity</span>
                <div className={`h-1 rounded-full transition-all duration-200 mt-1.5 ${
                  activeHomeSubTab === 'activity' ? 'w-14 bg-telegram-primary shadow-xs' : 'w-0 bg-transparent'
                }`} />
              </button>
            </div>
          )}
          {activeTab === 'files' && (
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-xs sm:text-sm font-bold text-telegram-text">My Drive</span>
            </div>
          )}

          {/* 3. Sub-Header Sort & Layout Switcher Controls (For Home, Files, or Starred views) */}
          {(activeTab === 'home' || activeTab === 'files' || (activeTab === 'starred' && (starredFolders.length > 0 || starredFiles.length > 0))) && (
            <div className="flex items-center justify-between px-1 text-xs pt-0.5">
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1.5 font-semibold text-telegram-text hover:text-telegram-primary transition cursor-pointer"
              >
                <span>Name</span>
                <div className="p-1 rounded-full bg-telegram-hover/40">
                  <ArrowUp className={`w-3 h-3 transition-transform duration-200 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* View Mode Switcher Pill [ ≡ | 🔲 ] */}
              <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </header>
      )}

      {/* Pull-to-Refresh Banner */}
      {(pullDistance > 0 || isSyncing) && (
        <div
          className="w-full flex items-center justify-center py-2 transition-all overflow-hidden"
          style={{ height: `${Math.min(Math.max(pullDistance, isSyncing ? 48 : 0), 60)}px`, opacity: isSyncing ? 1 : pullDistance / 60 }}
        >
          <div className="p-2 rounded-full bg-telegram-surface border border-telegram-border/50 text-telegram-primary shadow-md flex items-center gap-2 text-xs font-semibold">
            <RefreshCw className={`w-4 h-4 ${pullDistance > 60 || isSyncing ? 'animate-spin' : ''}`} style={{ transform: isSyncing ? undefined : `rotate(${pullDistance * 3}deg)` }} />
            <span>{isSyncing ? 'Syncing Drive...' : pullDistance > 60 ? 'Release to Sync' : 'Pull down to Sync'}</span>
          </div>
        </div>
      )}

      {/* Main Viewport Container with Touch Pull-to-Refresh */}
      <main
        ref={mainScrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex-1 overflow-y-auto px-4 py-3 space-y-4 scroll-smooth ${(activeTab as string) === 'settings' ? 'pb-10' : 'pb-36'}`}
      >
        {/* Home Tab: Suggested Files Carousel & Activity Feed */}
        {activeTab === 'home' && (
          <div className="space-y-5">
            {/* Suggested Files Section (Authentic Google Drive Large Card Feed) */}
            {activeHomeSubTab === 'suggested' && (
              <div className="space-y-4">
                {/* Sub-Header Row: Files label */}
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-telegram-text">Files</h3>
                </div>

                {/* Feed of Suggested File Cards (Grid vs List View) */}
                {suggestedFiles.length > 0 ? (
                  viewMode === 'list' ? (
                    <TouchFileList
                      files={suggestedFiles}
                      isLoading={isLoading && allFiles.length === 0}
                      onDownload={handleDownload}
                      onDelete={handleDeleteFile}
                      onPreview={handlePreview}
                      onRename={handleRenameFile}
                      onCopyTelegramLink={handleCopyTelegramLink}
                      selectedIds={selectedIds}
                      onToggleSelection={handleToggleSelection}
                      onSelectAll={handleSelectAll}
                      onClearSelection={handleClearSelection}
                      onBulkDelete={handleBulkDelete}
                      onBulkDownload={handleBulkDownload}
                      onBulkMove={handleBulkMove}
                      folders={folders}
                      activeFolderId={null}
                      scrollContainerRef={mainScrollRef}
                      viewMode="list"
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {suggestedFiles.map((file) => {
                        const openedTime = recentOpenedMap[file.id];
                        const actionLabel = openedTime ? 'You opened' : 'You uploaded';
                        const dateStr = file.date || 'Recent';

                        return (
                          <div
                            key={file.id}
                            onClick={() => handlePreview(file)}
                            className="w-full rounded-3xl bg-telegram-surface/80 border border-telegram-border/40 p-4 space-y-3 shadow-md cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.99] transition-all relative overflow-hidden"
                          >
                            {/* 1. Header Row: FileTypeIcon + Name + 3-dots */}
                            <div className="flex items-center gap-3">
                              <FileTypeIcon filename={file.name} className="w-5 h-5 shrink-0" />
                              <p className="text-sm font-semibold text-telegram-text truncate flex-1">{file.name}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuFile(file);
                                }}
                                className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 shrink-0"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>

                            {/* 2. Main Large Media Thumbnail Box */}
                            <div className="w-full h-48 rounded-2xl bg-[#1a1721] border border-telegram-border/20 flex items-center justify-center overflow-hidden relative shadow-inner">
                              <MobileFileThumbnail file={file} folderId={null} iconSize="lg" objectFit="contain" />
                            </div>

                            {/* 3. Footer Row: User Avatar + "You opened · Jul 24" */}
                            <div className="flex items-center gap-2.5 pt-1">
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center ring-1 ring-emerald-500/40 shrink-0 overflow-hidden">
                                {user?.photo_base64 ? (
                                  <img src={user.photo_base64} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                  user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'P'
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-telegram-subtext">
                                <span className="font-medium text-telegram-text/80">{actionLabel}</span>
                                <span>·</span>
                                <span>{dateStr}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="p-8 rounded-3xl bg-telegram-surface/60 border border-telegram-border/30 text-center space-y-2">
                    <p className="text-sm font-semibold text-telegram-text">No suggested files yet</p>
                    <p className="text-xs text-telegram-subtext font-normal">Upload files or sync your folders to see suggestions here.</p>
                  </div>
                )}
              </div>
            )}

            {/* Activity Feed Section */}
            {activeHomeSubTab === 'activity' && (
              <div className="space-y-3 px-1">
                <h3 className="text-[11px] font-bold text-telegram-subtext uppercase tracking-wider">Drive Activity & Logs</h3>
                
                <div className="space-y-2.5">
                  {activityLogs.length > 0 ? (
                    activityLogs.map(item => {
                      let icon = <Activity className="w-4 h-4" />;
                      let colorBg = 'bg-blue-500/20 text-blue-400';
                      if (item.type === 'upload') {
                        icon = <UploadCloud className="w-4 h-4" />;
                        colorBg = 'bg-blue-500/20 text-blue-400';
                      } else if (item.type === 'rename') {
                        icon = <Pencil className="w-4 h-4" />;
                        colorBg = 'bg-purple-500/20 text-purple-400';
                      } else if (item.type === 'star') {
                        icon = <Star className="w-4 h-4 fill-amber-400/20" />;
                        colorBg = 'bg-amber-500/20 text-amber-400';
                      } else if (item.type === 'share') {
                        icon = <Share2 className="w-4 h-4" />;
                        colorBg = 'bg-emerald-500/20 text-emerald-400';
                      } else if (item.type === 'delete') {
                        icon = <Trash2 className="w-4 h-4" />;
                        colorBg = 'bg-red-500/20 text-red-400';
                      } else if (item.type === 'sync') {
                        icon = <RefreshCw className="w-4 h-4" />;
                        colorBg = 'bg-teal-500/20 text-teal-400';
                      }

                      const timeDiffSec = Math.floor((Date.now() - item.timestamp) / 1000);
                      let timeStr = 'Just now';
                      if (timeDiffSec >= 45 && timeDiffSec < 3600) timeStr = `${Math.floor(timeDiffSec / 60)}m ago`;
                      else if (timeDiffSec >= 3600 && timeDiffSec < 86400) timeStr = `${Math.floor(timeDiffSec / 3600)}h ago`;
                      else if (timeDiffSec >= 86400) timeStr = `${Math.floor(timeDiffSec / 86400)}d ago`;

                      return (
                        <div key={item.id} className="flex items-start gap-3 p-3.5 rounded-2xl bg-telegram-surface/70 border border-telegram-border/40 hover:bg-telegram-hover/40 transition">
                          <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${colorBg}`}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-telegram-text truncate">{item.title}</p>
                              <span className="text-[10px] text-telegram-subtext/70 shrink-0 font-mono">{timeStr}</span>
                            </div>
                            <p className="text-[11px] text-telegram-subtext mt-0.5 truncate">{item.description}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 rounded-3xl bg-telegram-surface/60 border border-telegram-border/30 text-center space-y-2">
                      <p className="text-xs font-semibold text-telegram-text">No activity recorded yet</p>
                      <p className="text-[11px] text-telegram-subtext font-normal">Activities like uploads, renames, and syncs will show up here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Files Tab: Folder tree & Folder grid/list */}
        {activeTab === 'files' && (
          <div className="space-y-4">


            {/* Folders Section: List view vs Grid view based on viewMode */}
            {(categoryFilter === 'all' || categoryFilter === 'folders') && displayFolders.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-3.5" : "space-y-2"}>
                  {displayFolders.map((folder, idx) => {
                    const isStarredFolder = isFolderStarred(folder.id);
                    const isYellowFolder = idx === 0 || isStarredFolder;

                    if (viewMode === 'list') {
                      return (
                        <div
                          key={folder.id}
                          onClick={() => setActiveFolderId(folder.id)}
                          className="flex items-center justify-between p-3.5 bg-telegram-surface/70 border border-telegram-border/40 rounded-2xl cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.99] transition-all shadow-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Folder className={`w-5 h-5 shrink-0 ${isYellowFolder ? 'text-amber-400 fill-amber-400/30' : 'text-slate-300 fill-slate-300/20'}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-telegram-text truncate">{folder.name}</p>
                              <p className="text-[10px] text-telegram-subtext truncate">Folder</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isStarredFolder && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFolderActionMenu(folder);
                              }}
                              className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 shrink-0"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={folder.id}
                        onClick={() => setActiveFolderId(folder.id)}
                        className="flex flex-col justify-between p-3.5 bg-telegram-surface/80 border border-telegram-border/40 rounded-3xl cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.98] transition-all shadow-md h-36 relative group"
                      >
                        {/* Top row inside folder card */}
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Folder className={`w-4 h-4 shrink-0 ${isYellowFolder ? 'text-amber-400 fill-amber-400/30' : 'text-slate-300 fill-slate-300/20'}`} />
                            <span className="text-xs font-semibold text-telegram-text truncate leading-tight">{folder.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFolderActionMenu(folder);
                            }}
                            className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 shrink-0"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Center graphic: Large stylized folder shape */}
                        <div className="flex justify-center items-center py-2 opacity-30">
                          <Folder className={`w-14 h-14 stroke-[1.2] ${isYellowFolder ? 'text-amber-400 fill-amber-400/30' : 'text-slate-400 fill-slate-400/20'}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dynamic Real File List */}
            {categoryFilter !== 'folders' && (
              <TouchFileList
                files={sortedAndFilteredFiles}
                isLoading={isLoading && allFiles.length === 0}
                onDownload={handleDownload}
                onDelete={handleDeleteFile}
                onPreview={handlePreview}
                onRename={handleRenameFile}
                onDetails={(file) => setInfoItem(file)}
                onMoveToFolder={(file) => {
                  setSelectedIds([file.id]);
                  setShowMoveModal(true);
                }}
                onCopyTelegramLink={handleCopyTelegramLink}
                selectedIds={selectedIds}
                onToggleSelection={handleToggleSelection}
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
                onBulkDelete={handleBulkDelete}
                onBulkDownload={handleBulkDownload}
                onBulkMove={handleBulkMove}
                folders={folders}
                activeFolderId={activeFolderId}
                mutatingFolderIds={Array.from(mutatingFolderIds)}
                scrollContainerRef={mainScrollRef}
                viewMode={viewMode}
                hideEmptyState={displayFolders.length > 0 && activeFolderId === null}
              />
            )}
          </div>
        )}

        {activeTab === 'shared' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-telegram-subtext uppercase tracking-wider">Shared with Me</h3>
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center px-4">
              <div className="p-4 rounded-2xl bg-telegram-surface border border-telegram-border/30 text-telegram-subtext">
                <Users className="w-8 h-8 text-telegram-primary" />
              </div>
              <h4 className="text-sm font-bold text-telegram-text">No shared items yet</h4>
              <p className="text-xs text-telegram-subtext max-w-xs leading-relaxed">
                Files and folders shared with you via Telegram invite links will appear here.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'starred' && (
          <div className="space-y-4">
            {starredFolders.length > 0 || starredFiles.length > 0 ? (
              <>
                {starredFolders.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <h4 className="text-[11px] font-bold text-telegram-subtext uppercase tracking-wider px-1">Starred Folders</h4>
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-3.5" : "space-y-2"}>
                      {starredFolders.map((folder) => {
                        if (viewMode === 'list') {
                          return (
                            <div
                              key={folder.id}
                              onClick={() => { setActiveTab('files'); setActiveFolderId(folder.id); }}
                              className="flex items-center justify-between p-3.5 bg-telegram-surface/70 border border-telegram-border/40 rounded-2xl cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.99] transition-all shadow-xs"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Folder className="w-5 h-5 shrink-0 text-amber-400 fill-amber-400/30" />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-telegram-text truncate">{folder.name}</p>
                                  <p className="text-[10px] text-telegram-subtext truncate">Folder</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderActionMenu(folder);
                                  }}
                                  className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 shrink-0"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={folder.id}
                            onClick={() => { setActiveTab('files'); setActiveFolderId(folder.id); }}
                            className="flex flex-col justify-between p-3.5 bg-telegram-surface/80 border border-telegram-border/40 rounded-3xl cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.98] transition-all shadow-md h-36 relative group"
                          >
                            {/* Top row inside folder card */}
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <Folder className="w-4 h-4 shrink-0 text-amber-400 fill-amber-400/30" />
                                <span className="text-xs font-semibold text-telegram-text truncate leading-tight">{folder.name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderActionMenu(folder);
                                  }}
                                  className="p-1 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 shrink-0"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Center graphic: Large stylized folder shape */}
                            <div className="flex justify-center items-center py-2 opacity-30">
                              <Folder className="w-14 h-14 stroke-[1.2] text-amber-400 fill-amber-400/30" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {starredFiles.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-telegram-subtext uppercase tracking-wider px-1">Starred Files</h4>
                    <TouchFileList
                      files={starredFiles}
                      isLoading={false}
                      onDownload={handleDownload}
                      onDelete={handleDeleteFile}
                      onPreview={handlePreview}
                      onRename={handleRenameFile}
                      onCopyTelegramLink={handleCopyTelegramLink}
                      selectedIds={selectedIds}
                      onToggleSelection={handleToggleSelection}
                      onSelectAll={handleSelectAll}
                      onClearSelection={handleClearSelection}
                      onBulkDelete={handleBulkDelete}
                      onBulkDownload={handleBulkDownload}
                      onBulkMove={handleBulkMove}
                      folders={folders}
                      activeFolderId={activeFolderId}
                      scrollContainerRef={mainScrollRef}
                      viewMode={viewMode}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 py-12 space-y-4">
                <div className="w-36 h-36 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shadow-inner relative group">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500/10 to-yellow-300/20 blur-xl animate-pulse" />
                  <Star className="w-20 h-20 text-amber-400 fill-amber-300 stroke-[1.2] drop-shadow-md relative z-10" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <h3 className="text-lg font-bold text-telegram-text tracking-tight">No starred files</h3>
                  <p className="text-xs text-telegram-subtext leading-relaxed font-normal">
                    Add stars to things that you want to easily find later
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {(activeTab as string) === 'offline' && (
          <div className="space-y-4">
            {/* Sub-header Bar: Sort Pill & View Mode Switcher */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-telegram-surface border border-telegram-border/40 font-semibold text-telegram-text hover:text-telegram-primary transition cursor-pointer"
              >
                <span>Name</span>
                <ArrowUp className={`w-3.5 h-3.5 text-telegram-subtext transition-transform duration-200 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
              </button>

              <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {(() => {
              const displayOffline = searchQuery.trim()
                ? offlineFiles.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                : offlineFiles;

              return displayOffline.length > 0 ? (
                <TouchFileList
                  files={displayOffline}
                  isLoading={false}
                  onDownload={handleDownload}
                  onDelete={handleDeleteFile}
                  onPreview={handlePreview}
                  onRename={handleRenameFile}
                  onCopyTelegramLink={handleCopyTelegramLink}
                  selectedIds={selectedIds}
                  onToggleSelection={handleToggleSelection}
                  onSelectAll={handleSelectAll}
                  onClearSelection={handleClearSelection}
                  onBulkDelete={handleBulkDelete}
                  onBulkDownload={handleBulkDownload}
                  onBulkMove={handleBulkMove}
                  folders={folders}
                  activeFolderId={null}
                  scrollContainerRef={mainScrollRef}
                  viewMode={viewMode}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 py-12 space-y-4">
                  <div className="w-36 h-36 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner relative group">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/10 to-teal-300/20 blur-xl animate-pulse" />
                    <CheckCircle2 className="w-20 h-20 text-emerald-400 stroke-[1.2] drop-shadow-md relative z-10" />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <h3 className="text-lg font-bold text-telegram-text tracking-tight">
                      {searchQuery.trim() ? `No offline files matching "${searchQuery}"` : 'No offline files'}
                    </h3>
                    <p className="text-xs text-telegram-subtext leading-relaxed font-normal">
                      {searchQuery.trim() ? 'Try searching for another term.' : 'Files you make available offline will appear here so you can access them without internet.'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(activeTab as string) === 'recent' && (
          <div className="space-y-6 pt-0">
            {(() => {
              const displayRecent = searchQuery.trim()
                ? recentFiles.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                : recentFiles;

              return displayRecent.length > 0 ? (
                <div className="space-y-6">
                  {[
                    { label: 'Today', files: displayRecent.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      return t >= new Date().setHours(0,0,0,0);
                    })},
                    { label: 'Yesterday', files: displayRecent.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const today = new Date().setHours(0,0,0,0);
                      return t >= today - 86400000 && t < today;
                    })},
                    { label: 'Last week', files: displayRecent.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const today = new Date().setHours(0,0,0,0);
                      return t >= today - 6 * 86400000 && t < today - 86400000;
                    })},
                    { label: 'Earlier this month', files: displayRecent.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
                      const today = new Date().setHours(0,0,0,0);
                      return t >= firstOfMonth && t < today - 6 * 86400000;
                    })},
                    { label: 'Older', files: displayRecent.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
                      return t < firstOfMonth;
                    })}
                  ].filter(group => group.files.length > 0).map((group, groupIdx) => (
                    <div key={group.label} className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-bold text-white/90 tracking-tight">{group.label}</h3>
                        {groupIdx === 0 && (
                          <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
                            <button
                              onClick={() => setViewMode('list')}
                              className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                              title="List View"
                            >
                              <List className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setViewMode('grid')}
                              className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                              title="Grid View"
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 gap-3">
                          {group.files.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => handlePreview(file)}
                              className="group relative rounded-3xl bg-[#231f2c] p-3 border border-white/5 hover:border-telegram-primary/30 transition flex flex-col justify-between h-44 overflow-hidden select-none cursor-pointer"
                            >
                              <div className="flex items-center justify-between z-10">
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileTypeIcon filename={file.name} className="w-4 h-4 shrink-0" />
                                  <span className="text-xs font-medium text-white truncate">{file.name}</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActionMenuFile(file);
                                  }}
                                  className="p-1 rounded-full text-white/60 hover:bg-white/10 shrink-0 cursor-pointer"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Thumbnail Container */}
                              <div className="w-full flex-1 mt-2 rounded-xl overflow-hidden bg-black/30 flex items-center justify-center relative">
                                <MobileFileThumbnail
                                  file={file}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <TouchFileList
                          files={group.files}
                          isLoading={false}
                          onDownload={handleDownload}
                          onDelete={handleDeleteFile}
                          onPreview={handlePreview}
                          onRename={handleRenameFile}
                          onCopyTelegramLink={handleCopyTelegramLink}
                          selectedIds={selectedIds}
                          onToggleSelection={handleToggleSelection}
                          onSelectAll={handleSelectAll}
                          onClearSelection={handleClearSelection}
                          onBulkDelete={handleBulkDelete}
                          onBulkDownload={handleBulkDownload}
                          onBulkMove={handleBulkMove}
                          folders={folders}
                          activeFolderId={null}
                          scrollContainerRef={mainScrollRef}
                          viewMode={viewMode}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6 py-12 space-y-4">
                  <div className="w-36 h-36 rounded-full bg-telegram-primary/10 border border-telegram-primary/20 flex items-center justify-center shadow-inner relative group">
                    <Clock className="w-20 h-20 text-telegram-primary stroke-[1.2] drop-shadow-md relative z-10" />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <h3 className="text-lg font-bold text-telegram-text tracking-tight">
                      {searchQuery.trim() ? `No recent files matching "${searchQuery}"` : 'No recent files'}
                    </h3>
                    <p className="text-xs text-telegram-subtext leading-relaxed">
                      {searchQuery.trim() ? 'Try searching for another keyword.' : 'Files you open or upload recently will be listed here.'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(activeTab as string) === 'uploads' && (
          <div className="space-y-3 -mt-2">
            {/* Sub-header Bar: Sort Pill & View Mode Switcher */}
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-telegram-surface border border-telegram-border/40 font-semibold text-telegram-text hover:text-telegram-primary transition cursor-pointer"
              >
                <span>Date uploaded</span>
                <ArrowDown className={`w-3.5 h-3.5 text-telegram-subtext transition-transform duration-200 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
              </button>

              <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Date-Grouped Uploads */}
            {(() => {
              const displayUploads = searchQuery.trim()
                ? allFiles.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                : allFiles;

              return displayUploads.length > 0 ? (
                <div className="space-y-6">
                  {[
                    { label: 'Today', files: displayUploads.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      return t >= new Date().setHours(0,0,0,0);
                    })},
                    { label: 'Yesterday', files: displayUploads.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const today = new Date().setHours(0,0,0,0);
                      return t >= today - 86400000 && t < today;
                    })},
                    { label: 'Last week', files: displayUploads.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const today = new Date().setHours(0,0,0,0);
                      return t >= today - 6 * 86400000 && t < today - 86400000;
                    })},
                    { label: 'Earlier this month', files: displayUploads.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
                      const today = new Date().setHours(0,0,0,0);
                      return t >= firstOfMonth && t < today - 6 * 86400000;
                    })},
                    { label: 'Older', files: displayUploads.filter(f => {
                      const t = f.date_added ? new Date(f.date_added).getTime() : 0;
                      const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
                      return t < firstOfMonth;
                    })}
                  ].filter(group => group.files.length > 0).map(group => (
                    <div key={group.label} className="space-y-3">
                      <h3 className="text-xs font-bold text-white/80 tracking-wide px-1">{group.label}</h3>
                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 gap-3">
                          {group.files.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => handlePreview(file)}
                              className="group relative rounded-3xl bg-[#231f2c] p-3 border border-white/5 hover:border-telegram-primary/30 transition flex flex-col justify-between h-44 overflow-hidden select-none cursor-pointer"
                            >
                              <div className="flex items-center justify-between z-10">
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileTypeIcon filename={file.name} className="w-4 h-4 shrink-0" />
                                  <span className="text-xs font-medium text-white truncate">{file.name}</span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActionMenuFile(file);
                                  }}
                                  className="p-1 rounded-full text-white/60 hover:bg-white/10 shrink-0 cursor-pointer"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Thumbnail Container */}
                              <div className="w-full flex-1 mt-2 rounded-xl overflow-hidden bg-black/30 flex items-center justify-center relative">
                                <MobileFileThumbnail
                                  file={file}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <TouchFileList
                          files={group.files}
                          isLoading={false}
                          onDownload={handleDownload}
                          onDelete={handleDeleteFile}
                          onPreview={handlePreview}
                          onRename={handleRenameFile}
                          onCopyTelegramLink={handleCopyTelegramLink}
                          selectedIds={selectedIds}
                          onToggleSelection={handleToggleSelection}
                          onSelectAll={handleSelectAll}
                          onClearSelection={handleClearSelection}
                          onBulkDelete={handleBulkDelete}
                          onBulkDownload={handleBulkDownload}
                          onBulkMove={handleBulkMove}
                          folders={folders}
                          activeFolderId={null}
                          scrollContainerRef={mainScrollRef}
                          viewMode={viewMode}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6 py-12 space-y-4">
                  <div className="w-36 h-36 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-inner relative group">
                    <UploadCloud className="w-20 h-20 text-blue-400 stroke-[1.2] drop-shadow-md relative z-10" />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <h3 className="text-lg font-bold text-telegram-text tracking-tight">
                      {searchQuery.trim() ? `No uploads matching "${searchQuery}"` : 'No uploads'}
                    </h3>
                    <p className="text-xs text-telegram-subtext leading-relaxed">
                      {searchQuery.trim() ? 'Try searching for another keyword.' : 'Uploaded files will be organized here by upload date.'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(activeTab as string) === 'trash' && (
          <div className="space-y-4">
            {/* Google Drive Trash Notice Card */}
            <div className="p-4 bg-telegram-surface/90 border border-telegram-border/40 rounded-3xl space-y-2">
              <p className="text-telegram-subtext text-xs leading-snug">
                Items in trash will be deleted forever after 30 days
              </p>
              {(trashedFiles.length > 0 || trashedFolders.length > 0) && (
                <button
                  onClick={async () => {
                    emptyTrash(
                      async (msgId, folderId) => { await invoke('cmd_delete_file', { messageId: msgId, folderId: folderId === -999 ? null : folderId }); },
                      async (folderId, name) => { await invoke('cmd_delete_folder', { folderId, folderName: name }); }
                    );
                    toast.success('Emptied Trash successfully');
                  }}
                  className="text-telegram-primary font-bold text-xs hover:underline cursor-pointer transition block pt-1"
                >
                  Empty trash
                </button>
              )}
            </div>

            {/* Sub-header Bar: Sort Pill & View Mode Switcher */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-telegram-surface border border-telegram-border/40 font-semibold text-telegram-text hover:text-telegram-primary transition cursor-pointer"
              >
                <span>Date trashed</span>
                <ArrowUp className={`w-3.5 h-3.5 text-telegram-subtext transition-transform duration-200 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />
              </button>

              <div className="flex items-center bg-telegram-surface p-1 rounded-full border border-telegram-border/40">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'list' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="List View"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-full transition cursor-pointer ${viewMode === 'grid' ? 'bg-telegram-primary/30 text-telegram-primary shadow' : 'text-telegram-subtext'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {(() => {
              const displayTrashedFiles = searchQuery.trim()
                ? trashedFiles.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                : trashedFiles;
              const displayTrashedFolders = searchQuery.trim()
                ? trashedFolders.filter(f => (f.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim()))
                : trashedFolders;

              const hasItems = displayTrashedFiles.length > 0 || displayTrashedFolders.length > 0;

              return hasItems ? (
                <div className="space-y-4">
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Trashed Folders Grid Cards */}
                      {displayTrashedFolders.map((tf) => (
                        <div
                          key={tf.id}
                          className="group relative rounded-3xl bg-[#231f2c] p-4 border border-white/5 hover:border-telegram-primary/30 transition flex flex-col justify-between h-36 select-none"
                        >
                          <div className="flex items-start justify-between">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                              <Folder className="w-5 h-5 fill-amber-400/20" />
                            </div>
                            <button
                              onClick={() => setTrashedActionItem({ id: tf.id, name: tf.name, isFolder: true })}
                              className="p-1 rounded-full text-white/60 hover:bg-white/10 cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-white truncate">{tf.name}</p>
                            <p className="text-[10px] text-white/50">Folder</p>
                          </div>
                        </div>
                      ))}

                      {/* Trashed Files Grid Cards */}
                      {displayTrashedFiles.map((file) => (
                        <div
                          key={file.id}
                          className="group relative rounded-3xl bg-[#231f2c] p-3 border border-white/5 hover:border-telegram-primary/30 transition flex flex-col justify-between h-44 overflow-hidden select-none"
                        >
                          <div className="flex items-center justify-between z-10">
                            <div className="flex items-center gap-1.5 truncate">
                              <FileTypeIcon filename={file.name} className="w-4 h-4 shrink-0" />
                              <span className="text-xs font-medium text-white truncate">{file.name}</span>
                            </div>
                            <button
                              onClick={() => setTrashedActionItem({ id: file.id, name: file.name, isFolder: false })}
                              className="p-1 rounded-full text-white/60 hover:bg-white/10 shrink-0 cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Thumbnail Container */}
                          <div className="w-full flex-1 mt-2 rounded-xl overflow-hidden bg-black/30 flex items-center justify-center relative">
                            <MobileFileThumbnail
                              file={file}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Trashed Items List View */
                    <div className="space-y-2">
                      {displayTrashedFolders.map((tf) => (
                        <div key={tf.id} className="flex items-center justify-between p-3.5 bg-[#231f2c] border border-white/5 rounded-2xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <Folder className="w-5 h-5 shrink-0 text-amber-400" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{tf.name}</p>
                              <p className="text-[10px] text-white/50">Folder in Trash</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setTrashedActionItem({ id: tf.id, name: tf.name, isFolder: true })}
                            className="p-1.5 text-white/60 hover:bg-white/10 rounded-full transition cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {displayTrashedFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3.5 bg-[#231f2c] border border-white/5 rounded-2xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileTypeIcon filename={file.name} className="w-5 h-5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{file.name}</p>
                              <p className="text-[10px] text-white/50">{file.sizeStr || 'File'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setTrashedActionItem({ id: file.id, name: file.name, isFolder: false })}
                            className="p-1.5 text-white/60 hover:bg-white/10 rounded-full transition cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6 py-12 space-y-4">
                  <div className="w-36 h-36 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-inner relative group">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-red-500/10 to-amber-300/20 blur-xl animate-pulse" />
                    <Trash2 className="w-20 h-20 text-red-400 stroke-[1.2] drop-shadow-md relative z-10" />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <h3 className="text-lg font-bold text-telegram-text tracking-tight">
                      {searchQuery.trim() ? `No trash items matching "${searchQuery}"` : 'Trash is empty'}
                    </h3>
                    <p className="text-xs text-telegram-subtext leading-relaxed font-normal">
                      {searchQuery.trim() ? 'Try searching for another keyword.' : 'Items moved to trash will be stored here for 30 days before being permanently deleted.'}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {(activeTab as string) === 'settings' && (
          <div className="space-y-5 pb-8 select-none">
            {/* Header Title */}
            <div className="flex items-center gap-3 px-1 pt-1 pb-2">
              <div className="p-2.5 rounded-2xl bg-telegram-primary/10 border border-telegram-primary/20 text-telegram-primary shadow-sm">
                <Settings className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-telegram-text tracking-tight">App Settings</h2>
                <p className="text-xs text-telegram-subtext font-normal">Manage preferences, proxy, and diagnostic tools</p>
              </div>
            </div>

            {/* Preferences Section */}
            <div className="p-5 rounded-3xl bg-telegram-surface border border-telegram-border/40 shadow-lg space-y-4">
              <h3 className="text-xs font-bold text-telegram-primary tracking-wider uppercase flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5" />
                Preferences
              </h3>
              
              {/* Theme Setting */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div>
                  <p className="text-sm font-semibold text-telegram-text">Appearance Theme</p>
                  <p className="text-xs text-telegram-subtext mt-0.5">Choose light or dark mode theme</p>
                </div>
                <div className="relative">
                  <select
                    value={theme}
                    onChange={e => setTheme(e.target.value as 'dark' | 'light')}
                    className="appearance-none bg-telegram-bg border border-telegram-border/40 rounded-xl pl-3.5 pr-8 py-2 text-xs font-semibold text-telegram-text focus:outline-none focus:border-telegram-primary transition cursor-pointer shadow-inner"
                  >
                    <option value="dark" className="bg-telegram-surface text-telegram-text">Dark Theme</option>
                    <option value="light" className="bg-telegram-surface text-telegram-text">Light Theme</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Theme Presets Swatches */}
              {customThemes.length > 0 && (
                <div className="py-2 border-b border-telegram-border/20 space-y-2">
                  <p className="text-xs font-semibold text-telegram-text">Color Theme Presets</p>
                  <div className="grid grid-cols-4 gap-2">
                    {customThemes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setActiveCustomTheme(activeCustomThemeId === t.id ? null : t.id)}
                        className={`relative rounded-xl p-1 transition-all cursor-pointer ${activeCustomThemeId === t.id ? 'ring-2 ring-telegram-primary border border-telegram-primary' : 'border border-telegram-border/30 hover:border-telegram-border/60'}`}
                      >
                        <div className="rounded-lg overflow-hidden h-7 flex shadow-xs">
                          <div className="flex-1" style={{ background: t.palette.bg }} />
                          <div className="flex-1" style={{ background: t.palette.surface }} />
                          <div className="flex-1" style={{ background: t.palette.primary }} />
                        </div>
                        <p className="text-[10px] text-telegram-subtext mt-1 truncate text-center font-medium">{t.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Performance Mode Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-telegram-text">Performance Mode</p>
                  <p className="text-xs text-telegram-subtext mt-0.5 leading-relaxed">Disable blur effects and heavy animations for maximum speed.</p>
                </div>
                <button
                  onClick={() => updateSetting('performanceMode', !settings.performanceMode)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 border cursor-pointer ${settings.performanceMode ? 'bg-telegram-primary border-telegram-primary shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-slate-300 dark:bg-white/20 border-slate-400/50 dark:border-white/20 shadow-inner'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-200 ${settings.performanceMode ? 'translate-x-6 bg-white' : 'translate-x-0 bg-slate-600 dark:bg-slate-200'}`} />
                </button>
              </div>

              {/* ZIP Folders Before Upload */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-telegram-text">ZIP Folders Before Upload</p>
                  <p className="text-xs text-telegram-subtext mt-0.5 leading-relaxed">Automatically zip folders before uploading them to Telegram.</p>
                </div>
                <button
                  onClick={() => updateSetting('zipFolders', !settings.zipFolders)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 border cursor-pointer ${settings.zipFolders ? 'bg-telegram-primary border-telegram-primary shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-slate-300 dark:bg-white/20 border-slate-400/50 dark:border-white/20 shadow-inner'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-200 ${settings.zipFolders ? 'translate-x-6 bg-white' : 'translate-x-0 bg-slate-600 dark:bg-slate-200'}`} />
                </button>
              </div>

            </div>

            {/* Connection Diagnostics */}
            <div className="p-5 rounded-3xl bg-telegram-surface border border-telegram-border/40 shadow-lg space-y-4">
              <h3 className="text-xs font-bold text-telegram-primary tracking-wider uppercase flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5" />
                Connection Diagnostics
              </h3>

              {/* Connection status indicator */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-telegram-subtext" />
                  <p className="text-sm font-semibold text-telegram-text">Status</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-telegram-hover/30 border border-telegram-border/30">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`} />
                  <span className={`text-xs font-bold ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isConnected ? 'Connected to Telegram' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Ping test */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div>
                  <p className="text-sm font-semibold text-telegram-text">Ping</p>
                  <p className="text-xs text-telegram-subtext mt-0.5 font-medium">
                    {latencyMs !== null
                      ? latencyMs >= 0
                        ? `${latencyMs} ms`
                        : 'Offline'
                      : 'Not tested'}
                  </p>
                </div>
                <button
                  onClick={handleCheckLatency}
                  disabled={checkingLatency}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-telegram-primary/20 text-telegram-primary hover:bg-telegram-primary/30 border border-telegram-primary/30 active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {checkingLatency ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      Check Ping
                    </>
                  )}
                </button>
              </div>

              {/* Latency quality bar */}
              {latencyMs !== null && latencyMs >= 0 && (
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-2 rounded-full bg-telegram-bg overflow-hidden border border-telegram-border/30 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${latencyMs < 100 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : latencyMs < 250 ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
                      style={{ width: `${Math.min(100, Math.max(5, (500 - latencyMs) / 5))}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${latencyMs < 100 ? 'text-emerald-400' : latencyMs < 250 ? 'text-amber-400' : 'text-red-400'}`}>
                    {latencyMs < 100 ? 'Excellent' : latencyMs < 250 ? 'Good' : 'Slow'}
                  </span>
                </div>
              )}

              {/* Bandwidth stats */}
              {bandwidth && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold text-telegram-text">Bandwidth Usage</p>
                    <p className="text-xs text-telegram-subtext mt-0.5">Upload / Download since connected</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-telegram-text bg-telegram-bg px-3 py-1.5 rounded-xl border border-telegram-border/30 shadow-inner">
                      <span className="text-emerald-400">↑ {formatBytes(bandwidth.up_bytes)}</span>
                      <span className="text-telegram-subtext/40 mx-1.5">|</span>
                      <span className="text-sky-400">↓ {formatBytes(bandwidth.down_bytes)}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Proxy Configuration */}
            <div className="p-5 rounded-3xl bg-telegram-surface border border-telegram-border/40 shadow-lg space-y-4">
              <h3 className="text-xs font-bold text-telegram-primary tracking-wider uppercase flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" />
                Proxy
              </h3>

              {/* Enable Proxy Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div className="pr-4">
                  <p className="text-sm font-semibold text-telegram-text">Enable Proxy</p>
                  <p className="text-xs text-telegram-subtext mt-0.5 leading-relaxed">Route connections through a proxy server for improved privacy or access.</p>
                </div>
                <button
                  onClick={() => updateSetting('proxyEnabled', !settings.proxyEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-200 shrink-0 border cursor-pointer ${settings.proxyEnabled ? 'bg-telegram-primary border-telegram-primary shadow-[0_0_10px_rgba(59,130,246,0.4)]' : 'bg-slate-300 dark:bg-white/20 border-slate-400/50 dark:border-white/20 shadow-inner'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-200 ${settings.proxyEnabled ? 'translate-x-6 bg-white' : 'translate-x-0 bg-slate-600 dark:bg-slate-200'}`} />
                </button>
              </div>

              {/* Proxy Type */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div>
                  <p className="text-sm font-semibold text-telegram-text">Proxy Type</p>
                  <p className="text-xs text-telegram-subtext mt-0.5">SOCKS5 is the only supported proxy type.</p>
                </div>
                <div className="relative">
                  <select
                    value={settings.proxyType}
                    onChange={e => updateSetting('proxyType', e.target.value as 'socks5')}
                    className="appearance-none bg-telegram-bg border border-telegram-border/40 rounded-xl pl-3.5 pr-8 py-2 text-xs font-semibold text-telegram-text focus:outline-none focus:border-telegram-primary transition cursor-pointer shadow-inner"
                  >
                    <option value="socks5" className="bg-telegram-surface text-telegram-text">SOCKS5</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Host */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div>
                  <p className="text-sm font-semibold text-telegram-text">Host</p>
                  <p className="text-xs text-telegram-subtext mt-0.5">IP address or hostname of the proxy server.</p>
                </div>
                <input
                  type="text"
                  placeholder="127.0.0.1"
                  value={settings.proxyHost}
                  onChange={e => updateSetting('proxyHost', e.target.value)}
                  className="w-36 bg-telegram-bg border border-telegram-border/40 rounded-xl px-3 py-2 text-xs font-medium text-telegram-text text-right focus:outline-none focus:border-telegram-primary transition placeholder:text-telegram-subtext/40 shadow-inner"
                />
              </div>

              {/* Port */}
              <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                <div>
                  <p className="text-sm font-semibold text-telegram-text">Port</p>
                  <p className="text-xs text-telegram-subtext mt-0.5">Port number of the proxy server (1–65535).</p>
                </div>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={settings.proxyPort}
                  onChange={e => updateSetting('proxyPort', Math.max(1, Math.min(65535, parseInt(e.target.value) || 1080)))}
                  className="w-24 bg-telegram-bg border border-telegram-border/40 rounded-xl px-3 py-2 text-xs font-medium text-telegram-text text-center focus:outline-none focus:border-telegram-primary transition shadow-inner"
                />
              </div>

              {/* SOCKS5 auth fields */}
              {settings.proxyType === 'socks5' && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-telegram-border/20">
                    <div>
                      <p className="text-sm font-semibold text-telegram-text">Username</p>
                      <p className="text-xs text-telegram-subtext mt-0.5">Optional</p>
                    </div>
                    <input
                      type="text"
                      placeholder="Optional"
                      value={settings.proxyUsername}
                      onChange={e => updateSetting('proxyUsername', e.target.value)}
                      className="w-36 bg-telegram-bg border border-telegram-border/40 rounded-xl px-3 py-2 text-xs font-medium text-telegram-text text-right focus:outline-none focus:border-telegram-primary transition placeholder:text-telegram-subtext/40 shadow-inner"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-semibold text-telegram-text">Password</p>
                      <p className="text-xs text-telegram-subtext mt-0.5">Optional</p>
                    </div>
                    <input
                      type="password"
                      placeholder="Optional"
                      value={settings.proxyPassword}
                      onChange={e => updateSetting('proxyPassword', e.target.value)}
                      className="w-36 bg-telegram-bg border border-telegram-border/40 rounded-xl px-3 py-2 text-xs font-medium text-telegram-text text-right focus:outline-none focus:border-telegram-primary transition placeholder:text-telegram-subtext/40 shadow-inner"
                    />
                  </div>
                </>
              )}

              {/* Info note */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-300/90 leading-relaxed font-normal">
                  Changes take effect after reconnecting to Telegram.
                </p>
              </div>
            </div>

            {/* Shared Files (Android only) */}
            {isAndroid && cachedFiles.length > 0 && (
              <div className="p-5 rounded-3xl bg-telegram-surface border border-telegram-border/40 shadow-lg space-y-4">
                <h3 className="text-xs font-bold text-telegram-primary tracking-wider uppercase flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5" />
                  Shared Files ({cachedFiles.length})
                </h3>
                <div className="space-y-2.5">
                  {cachedFiles.map((entry) => {
                    const isUploading = uploadingCacheFiles.has(entry.cached_path);
                    return (
                      <div
                        key={entry.cached_path}
                        className="flex items-center justify-between p-3.5 rounded-2xl bg-telegram-bg border border-telegram-border/30"
                      >
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-xs font-semibold text-telegram-text truncate">{entry.file_name}</p>
                          <p className="text-[10px] text-telegram-subtext font-mono mt-0.5">{formatBytes(entry.file_size)}</p>
                        </div>
                        <button
                          onClick={() => handleUploadCachedFile(entry)}
                          disabled={isUploading || !isConnected}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-telegram-primary text-black hover:bg-telegram-primary/90 active:scale-95 transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                        >
                          {isUploading ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <UploadCloud className="w-3.5 h-3.5" />
                              Upload
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleClearCachedSharedFiles}
                  className="w-full text-center text-xs font-semibold text-red-400/80 hover:text-red-400 transition-colors py-1 cursor-pointer"
                >
                  Clear Shared Files
                </button>
              </div>
            )}

            {/* About Card */}
            <div className="p-6 rounded-3xl bg-telegram-surface border border-telegram-border/40 shadow-lg text-center space-y-4">
              <h3 className="text-xs font-bold text-telegram-primary tracking-wider uppercase flex items-center justify-center gap-2">
                <Info className="w-3.5 h-3.5" />
                About
              </h3>
              <div className="flex flex-col items-center py-2 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-telegram-primary/10 border border-telegram-primary/20 p-2 flex items-center justify-center shadow-lg">
                  <img src="/logo.svg?v=2" className="w-full h-full drop-shadow" alt="Telegram Drive Logo" />
                </div>
                <div>
                  <p className="text-base font-bold text-telegram-text tracking-tight">Telegram Drive</p>
                  <p className="text-xs text-telegram-subtext font-mono mt-0.5">v{appVersion}</p>
                </div>

                <div className="w-12 h-px bg-telegram-border/30" />

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-telegram-subtext">Developed by chauhan-pratham</p>

                  <button
                    onClick={(e) => { e.preventDefault(); openUrl('https://github.com/chauhan-pratham/Telegram-Drive'); }}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold text-telegram-primary hover:text-telegram-primary/80 transition-colors cursor-pointer px-4 py-2 rounded-xl bg-telegram-primary/10 border border-telegram-primary/20"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub Repository
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Folder action popover (replaces swipe-to-reveal) */}
      {folderActionMenu && (
        <ActionPopover
          title={folderActionMenu.name}
          actions={buildFolderActions(folderActionMenu)}
          onClose={() => setFolderActionMenu(null)}
        />
      )}

      {/* Rename folder bottom sheet */}
      {renameFolder && (
        <RenameFolderSheet
          folderId={renameFolder.id}
          currentName={renameFolder.name}
          onRename={handleFolderRename}
          onClose={() => setRenameFolder(null)}
        />
      )}

      {/* Google Drive Account & Profile Floating Card Dialog */}
      {showProfileSheet && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowProfileSheet(false)}>
          <div
            className="w-full max-w-sm bg-telegram-surface border border-telegram-border/50 rounded-3xl p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header row */}
            <div className="flex items-center justify-between pb-1 border-b border-telegram-border/30">
              <span className="text-[11px] font-bold text-telegram-subtext uppercase tracking-wider">Telegram Drive Account</span>
              <button onClick={() => setShowProfileSheet(false)} className="p-1.5 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Info Card */}
            <div className="flex items-center gap-3.5 p-3.5 bg-telegram-bg/70 rounded-2xl border border-telegram-border/30 shadow-inner">
              <div className="w-13 h-13 rounded-full bg-telegram-primary/20 text-telegram-primary font-bold text-xl flex items-center justify-center ring-2 ring-emerald-400 shrink-0 overflow-hidden shadow-md">
                {user?.photo_base64 ? (
                  <img src={user.photo_base64} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <h4 className="text-sm font-bold text-telegram-text truncate">
                  {user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Telegram User'}
                </h4>
                {user?.username && (
                  <p className="text-xs text-telegram-subtext font-mono truncate">@{user.username}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className={`text-[10px] font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                    {isConnected ? 'Telegram Connected' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action options */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  setShowProfileSheet(false);
                  setActiveTab('files');
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-telegram-hover/30 hover:bg-telegram-hover/60 border border-telegram-border/30 text-xs font-semibold text-telegram-text transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <HardDrive className="w-4.5 h-4.5 text-telegram-primary" />
                  <span>My Telegram Cloud Storage</span>
                </div>
                <ChevronDown className="w-4 h-4 -rotate-90 text-telegram-subtext" />
              </button>

              <button
                onClick={() => {
                  setShowProfileSheet(false);
                  setActiveTab('settings' as MobileTab);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-telegram-hover/30 hover:bg-telegram-hover/60 border border-telegram-border/30 text-xs font-semibold text-telegram-text transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4.5 h-4.5 text-telegram-primary" />
                  <span>Drive Settings & Preferences</span>
                </div>
                <ChevronDown className="w-4 h-4 -rotate-90 text-telegram-subtext" />
              </button>

              <button
                onClick={() => {
                  setShowProfileSheet(false);
                  onLogout?.();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-semibold text-red-400 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-4.5 h-4.5 text-red-400" />
                  <span>Sign Out of Telegram</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Google Drive Floating Action Button (+ New) */}
      {(activeTab as string) !== 'settings' && (activeTab as string) !== 'trash' && (activeTab as string) !== 'offline' && (activeTab as string) !== 'recent' && (activeTab as string) !== 'uploads' && (
        <div className="fixed bottom-20 right-4 z-40">
          <button
            onClick={() => setShowFabMenu(true)}
            className="w-14 h-14 rounded-3xl bg-telegram-primary text-black font-bold shadow-2xl shadow-telegram-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
            title="Create New"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* Google Drive Official "Create New" Bottom Sheet Modal */}
      {showFabMenu && (
        <div
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-end animate-in fade-in duration-200"
          onClick={() => setShowFabMenu(false)}
        >
          <div
            className="w-full bg-telegram-surface border-t border-telegram-border/40 rounded-t-3xl p-6 pb-8 space-y-5 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle Indicator */}
            <div className="w-10 h-1 rounded-full bg-telegram-text/20 mx-auto" />

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-telegram-text">Create new</h3>
              <button onClick={() => setShowFabMenu(false)} className="p-1.5 rounded-full text-telegram-subtext hover:text-telegram-text hover:bg-white/10 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3-Column Material Circular Grid */}
            <div className="grid grid-cols-3 gap-4 text-center py-2 max-w-sm mx-auto">
              {/* Folder */}
              <button
                onClick={() => {
                  setShowFabMenu(false);
                  setShowCreateFolderSheet(true);
                }}
                className="flex flex-col items-center gap-2.5 group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 active:scale-95 transition-all shadow-md">
                  <FolderPlus className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-telegram-text">Folder</span>
              </button>

              {/* Upload File */}
              <button
                onClick={() => {
                  setShowFabMenu(false);
                  handleManualUpload();
                }}
                className="flex flex-col items-center gap-2.5 group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-105 active:scale-95 transition-all shadow-md">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-telegram-text">Upload File</span>
              </button>

              {/* Upload Folder (ZIP) */}
              <button
                onClick={() => {
                  setShowFabMenu(false);
                  handleFolderUpload();
                }}
                className="flex flex-col items-center gap-2.5 group cursor-pointer"
              >
                <div className="w-14 h-14 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 active:scale-95 transition-all shadow-md">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-telegram-text">Folder (ZIP)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Nav Bar */}
      {(activeTab as string) !== 'settings' && (activeTab as string) !== 'trash' && (activeTab as string) !== 'offline' && (activeTab as string) !== 'recent' && (activeTab as string) !== 'uploads' && (
        <BottomNavBar activeTab={activeTab} setActiveTab={handleTabChange} isAndroid={isAndroid} />
      )}

      {/* Previews Overlays (Media, PDF & Images) */}
      {playingFile && (
        <div className="fixed inset-0 z-[100] bg-black/90">
          <MediaPlayer
            key={playingFile.id}
            file={playingFile}
            onClose={() => setPlayingFile(null)}
            activeFolderId={activeFolderId}
            onDownload={handleDownload}
            onShare={handleCopyTelegramLink}
            onDelete={handleDeleteFile}
          />
        </div>
      )}
      {pdfFile && (
        <div className="fixed inset-0 z-[100] bg-telegram-bg">
          <PdfViewer
            file={pdfFile}
            onClose={() => setPdfFile(null)}
            activeFolderId={activeFolderId}
            onDownload={handleDownload}
            onShare={handleCopyTelegramLink}
            onDelete={handleDeleteFile}
          />
        </div>
      )}
      {previewFile && (
        <PreviewModal
          file={previewFile}
          activeFolderId={activeFolderId}
          folders={folders}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownload}
          onShare={handleCopyTelegramLink}
          onDelete={handleDeleteFile}
        />
      )}





      {/* Suggested Card File Action Popover Sheet */}
      {actionMenuFile && (
        <ActionPopover
          title={actionMenuFile.name}
          actions={buildSuggestedFileActions(actionMenuFile)}
          onClose={() => setActionMenuFile(null)}
        />
      )}

      {/* Trashed Item Action Popover Sheet */}
      {trashedActionItem && (
        <ActionPopover
          title={trashedActionItem.name}
          actions={[
            {
              label: 'Restore',
              icon: <RefreshCw className="w-4 h-4" />,
              onClick: () => {
                if (trashedActionItem.isFolder) {
                  restoreFolder(trashedActionItem.id);
                  toast.success(`Restored folder "${trashedActionItem.name}"`);
                } else {
                  restoreFile(trashedActionItem.id);
                  toast.success(`Restored "${trashedActionItem.name}"`);
                }
                setTrashedActionItem(null);
              },
            },
            {
              label: 'Delete forever',
              icon: <Trash2 className="w-4 h-4" />,
              onClick: () => {
                if (trashedActionItem.isFolder) {
                  deleteFolderPermanently(trashedActionItem.id);
                  toast.success(`Deleted folder "${trashedActionItem.name}" permanently`);
                } else {
                  deletePermanently(trashedActionItem.id);
                  toast.success(`Deleted "${trashedActionItem.name}" permanently`);
                }
                setTrashedActionItem(null);
              },
              destructive: true,
            },
          ]}
          onClose={() => setTrashedActionItem(null)}
        />
      )}

      {makePublicFolder && (
        <MakePublicSheet
          folderName={makePublicFolder.name}
          defaultUsername={makePublicFolder.defaultUsername}
          onConfirm={async (username) => {
            try {
              await handleFolderToggleVisibility(makePublicFolder.id, true, username);
            } catch { /* error already toasted */ }
          }}
          onClose={() => setMakePublicFolder(null)}
        />
      )}

      {renameFile && (
        <RenameFileSheet
          fileName={renameFile.currentName}
          onRename={async (newName) => {
            try {
              await invoke('cmd_rename_file', {
                messageId: renameFile.id,
                folderId: activeFolderId,
                newName,
              });
              setFileRenames(prev => {
                const next = new Map(prev);
                next.set(renameFile.id, newName);
                return next;
              });
              queryClient.invalidateQueries({ queryKey: ['files'] });
              toast.success(`Renamed to "${newName}"`);
            } catch (err: any) {
              toast.error(`Failed to rename: ${err?.message || err}`);
            }
          }}
          onClose={() => setRenameFile(null)}
        />
      )}

      {showCreateFolderSheet && (
        <CreateFolderSheet
          onCreate={async (name) => {
            await handleCreateFolder(name, activeFolderId);
          }}
          onClose={() => setShowCreateFolderSheet(false)}
        />
      )}

      {privateShareModalFile && (
        <PrivateShareSheet
          file={privateShareModalFile}
          folder={folders.find(f => f.id === privateShareModalFile.folder_id) || folders.find(f => f.id === activeFolderId)}
          onCopyPrivateLink={() => {
            const folderId = privateShareModalFile.folder_id || activeFolderId;
            if (folderId && folderId !== -999) {
              const cleanChannelId = Math.abs(folderId).toString().replace(/^100/, '');
              const url = `https://t.me/c/${cleanChannelId}/${privateShareModalFile.id}`;
              navigator.clipboard.writeText(url).then(() => {
                toast.success('Private Telegram link copied (channel members only)');
              });
            } else {
              toast.info('Saved Messages links are private to your Telegram account');
            }
          }}
          onMakeFolderPublic={() => {
            const folder = folders.find(f => f.id === privateShareModalFile.folder_id) || folders.find(f => f.id === activeFolderId);
            if (folder) {
              const defaultUsername = folder.name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
              setMakePublicFolder({ id: folder.id, name: folder.name, defaultUsername });
            }
          }}
          onCopyFolderInvite={() => {
            const folder = folders.find(f => f.id === privateShareModalFile.folder_id) || folders.find(f => f.id === activeFolderId);
            if (folder) {
              setFolderInviteWarningModal(folder);
            }
          }}
          onClose={() => setPrivateShareModalFile(null)}
        />
      )}

      {folderInviteWarningModal && (
        <FolderInviteWarningSheet
          folder={folderInviteWarningModal}
          onConfirm={() => confirmFolderShareInvite(folderInviteWarningModal)}
          onClose={() => setFolderInviteWarningModal(null)}
        />
      )}

      {showMoveModal && (
        <MoveToFolderModal
          folders={folders}
          activeFolderId={activeFolderId}
          onClose={() => setShowMoveModal(false)}
          onSelect={async (targetFolderId) => {
            setShowMoveModal(false);
            try {
              const targetName = targetFolderId === null ? 'My Drive' : folders.find(f => f.id === targetFolderId)?.name || 'Folder';
              toast.info(`Moving ${selectedIds.length} item(s) to "${targetName}"...`);
              await invoke('cmd_move_files_to_folder', {
                fileIds: selectedIds.filter(id => allFiles.some(f => f.id === id)),
                targetFolderId,
              });
              toast.success(`Moved ${selectedIds.length} item(s) to "${targetName}"`);
              queryClient.invalidateQueries({ queryKey: ['files'] });
              queryClient.invalidateQueries({ queryKey: ['folders'] });
              setSelectedIds([]);
            } catch (err) {
              toast.error(`Failed to move items: ${err}`);
            }
          }}
          onCreateFolder={handleCreateFolder}
        />
      )}

      {infoItem && (
        <MobileDetailsSheet
          item={infoItem}
          onClose={() => setInfoItem(null)}
          folders={folders}
        />
      )}

      {showSortFilterSheet && (
        <SortFilterSheet
          sortField={sortField}
          setSortField={setSortField}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          fileTypeFilter={fileTypeFilter}
          setFileTypeFilter={setFileTypeFilter}
          onClose={() => setShowSortFilterSheet(false)}
        />
      )}

      {/* Authentic Google Drive Side Navigation Drawer */}
      {showDrawer && (
        <div
          className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowDrawer(false)}
        >
          <div
            className="w-80 max-w-[85vw] h-full bg-telegram-surface border-r border-telegram-border/40 shadow-2xl flex flex-col justify-between p-5 animate-in slide-in-from-left duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Top Drawer Title */}
              <div className="flex items-center justify-between pt-2 px-3">
                <h2 className="text-xl font-bold text-telegram-text tracking-tight flex items-center gap-2">
                  <span className="text-telegram-primary">Telegram</span> Drive
                </h2>
              </div>

              {/* Navigation Menu List */}
              <nav className="space-y-1">
                {/* Recent */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setActiveTab('recent' as any);
                    setActiveFolderId(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <Clock className="w-5 h-5 text-telegram-subtext" />
                  <span>Recent</span>
                </button>

                {/* Uploads */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setActiveTab('uploads' as any);
                    setActiveFolderId(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <UploadCloud className="w-5 h-5 text-telegram-subtext" />
                  <span>Uploads</span>
                </button>

                {/* Offline */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setActiveTab('offline' as any);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5 text-telegram-subtext" />
                  <span>Offline</span>
                </button>

                {/* Trash */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setActiveTab('trash' as any);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <Trash2 className="w-5 h-5 text-telegram-subtext" />
                  <span>Trash</span>
                </button>

                {/* Settings */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    setActiveTab('settings' as MobileTab);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <Settings className="w-5 h-5 text-telegram-subtext" />
                  <span>Settings</span>
                </button>

                {/* Help & feedback */}
                <button
                  onClick={() => {
                    setShowDrawer(false);
                    openUrl('https://github.com/chauhan-pratham/Telegram-Drive');
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full text-sm font-medium text-telegram-text hover:bg-telegram-hover/40 active:bg-telegram-hover/60 transition cursor-pointer"
                >
                  <HelpCircle className="w-5 h-5 text-telegram-subtext" />
                  <span>Help & feedback</span>
                </button>
              </nav>
            </div>

            {/* Storage Section at Bottom */}
            <div className="pt-4 border-t border-telegram-border/30 space-y-3 px-2 mb-2">
              <div className="flex items-center justify-between text-telegram-text">
                <div className="flex items-center gap-2.5">
                  <Cloud className="w-5 h-5 text-telegram-primary shrink-0" />
                  <span className="text-sm font-bold tracking-tight">Storage</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm">
                  Unlimited
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-telegram-subtext font-medium">Used</span>
                  <span className="text-telegram-text font-bold font-mono">{formatBytes(totalStorageSize)}</span>
                </div>
                <div className="w-full h-1.5 bg-telegram-border/40 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <div className="w-full h-full bg-gradient-to-r from-telegram-primary via-emerald-400 to-teal-300 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MakePublicSheet({
  folderName,
  defaultUsername,
  onConfirm,
  onClose,
}: {
  folderName: string;
  defaultUsername: string;
  onConfirm: (username?: string) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(defaultUsername);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>
        <h3 className="text-base font-bold text-telegram-text mb-1">Make "{folderName}" Public</h3>
        <p className="text-xs text-telegram-subtext mb-4">
          Enter an optional username for your public link (or leave blank to auto-generate):
        </p>

        <form onSubmit={(e) => {
          e.preventDefault();
          onConfirm(username.trim() || undefined);
          onClose();
        }}>
          <div className="relative mb-6">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-telegram-subtext font-semibold text-sm">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="channel_username"
              className="w-full pl-8 pr-4 py-3 bg-telegram-bg border border-telegram-border/40 rounded-xl text-telegram-text text-sm focus:outline-none focus:border-telegram-primary transition-all"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-telegram-hover/30 hover:bg-telegram-hover/60 text-telegram-subtext font-semibold rounded-xl text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-telegram-primary hover:bg-telegram-primary/80 text-black font-bold rounded-xl text-sm transition-all shadow-lg"
            >
              Make Public
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RenameFileSheet({
  fileName,
  onRename,
  onClose,
}: {
  fileName: string;
  onRename: (newName: string) => void;
  onClose: () => void;
}) {
  const { basename, extension } = useMemo(() => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return {
        basename: fileName.substring(0, lastDotIndex),
        extension: fileName.substring(lastDotIndex)
      };
    }
    return { basename: fileName, extension: '' };
  }, [fileName]);

  const [name, setName] = useState(basename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [fileName]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>
        <h3 className="text-base font-bold text-telegram-text mb-4">Rename File</h3>

        <form onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          const finalName = trimmed + extension;
          if (trimmed && finalName !== fileName) {
            onRename(finalName);
          }
          onClose();
        }}>
          <div className="flex items-center w-full bg-telegram-bg border border-telegram-border/40 rounded-xl overflow-hidden focus-within:border-telegram-primary transition-all mb-6">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-4 py-3 bg-transparent text-telegram-text text-sm focus:outline-none"
              placeholder="File name"
            />
            {extension && (
              <span className="px-3.5 py-3 bg-white/5 border-l border-telegram-border/30 text-xs font-mono font-semibold text-telegram-subtext select-none shrink-0">
                {extension}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-telegram-hover/30 hover:bg-telegram-hover/60 text-telegram-subtext font-semibold rounded-xl text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || (name.trim() + extension) === fileName}
              className="flex-1 py-3 bg-telegram-primary hover:bg-telegram-primary/80 disabled:opacity-50 text-black font-bold rounded-xl text-sm transition-all shadow-lg"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateFolderSheet({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>
        <h3 className="text-base font-bold text-telegram-text mb-4">New Folder</h3>

        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || creating) return;
          setCreating(true);
          try {
            await onCreate(name.trim());
            onClose();
          } finally {
            setCreating(false);
          }
        }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            className="w-full px-4 py-3 bg-telegram-bg border border-telegram-border/40 rounded-xl text-telegram-text text-sm focus:outline-none focus:border-telegram-primary transition-all mb-6"
            autoFocus
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-telegram-hover/30 hover:bg-telegram-hover/60 text-telegram-subtext font-semibold rounded-xl text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="flex-1 py-3 bg-telegram-primary hover:bg-telegram-primary/80 disabled:opacity-50 text-black font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PrivateShareSheet({
  file,
  folder,
  onCopyPrivateLink,
  onMakeFolderPublic,
  onCopyFolderInvite,
  onClose,
}: {
  file: TelegramFile;
  folder?: TelegramFolder;
  onCopyPrivateLink: () => void;
  onMakeFolderPublic: () => void;
  onCopyFolderInvite: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-telegram-text">Private Folder Link Notice</h3>
            <p className="text-xs text-telegram-subtext mt-0.5 truncate max-w-[240px]">"{file.name}" is in a private folder</p>
          </div>
        </div>

        <div className="p-3.5 bg-telegram-hover/20 border border-telegram-border/30 rounded-2xl space-y-2 text-xs text-telegram-subtext leading-relaxed">
          <p className="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            Recipients must be members of this folder channel to open this file link.
          </p>
          <p>
            Telegram channels do not support per-file sharing. To share access with non-members, select an option below:
          </p>
        </div>

        <div className="space-y-2.5 pt-1">
          {folder && !(folder.id === -999 || folder.name === 'Saved Messages') && (
            <>
              <button
                onClick={() => { onClose(); onMakeFolderPublic(); }}
                className="w-full flex items-center justify-between p-3.5 bg-telegram-primary/10 border border-telegram-primary/30 hover:bg-telegram-primary/20 rounded-2xl text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-telegram-primary shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-telegram-text">Make Folder Public</p>
                    <p className="text-[10px] text-telegram-subtext">Generates a public t.me link accessible to anyone</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => { onClose(); onCopyFolderInvite(); }}
                className="w-full flex items-center justify-between p-3.5 bg-telegram-hover/20 border border-telegram-border/30 hover:bg-telegram-hover/40 rounded-2xl text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Share2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-telegram-text">Copy Folder Invite Link</p>
                    <p className="text-[10px] text-telegram-subtext">Grants recipient access to ALL files in this folder</p>
                  </div>
                </div>
              </button>
            </>
          )}

          <button
            onClick={() => { onClose(); onCopyPrivateLink(); }}
            className="w-full flex items-center justify-between p-3.5 bg-telegram-hover/20 border border-telegram-border/30 hover:bg-telegram-hover/40 rounded-2xl text-left transition-all group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Copy className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-telegram-text">Copy Member-Only Link</p>
                <p className="text-[10px] text-telegram-subtext">Link works ONLY for existing members of this channel</p>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-telegram-hover/20 hover:bg-telegram-hover/40 text-telegram-subtext font-semibold rounded-2xl text-xs transition-all mt-2 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FolderInviteWarningSheet({
  folder,
  onConfirm,
  onClose,
}: {
  folder: TelegramFolder;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-telegram-text">⚠️ Share Folder Access</h3>
            <p className="text-xs text-telegram-subtext mt-0.5 truncate max-w-[240px]">"{folder.name}" Invite Link Warning</p>
          </div>
        </div>

        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-200/90 leading-relaxed">
          Anyone who joins using this invite link will be able to view and download <strong>ALL files</strong> stored inside <strong>"{folder.name}"</strong>.
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 bg-telegram-hover/30 hover:bg-telegram-hover/60 text-telegram-subtext font-semibold rounded-2xl text-xs transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-2xl text-xs transition-all shadow-lg cursor-pointer"
          >
            Copy Invite Link
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileDetailsSheet({
  item,
  onClose,
  folders,
}: {
  item: TelegramFile | TelegramFolder;
  onClose: () => void;
  folders: TelegramFolder[];
}) {
  const isFolder = 'mime_type' in item ? item.mime_type === 'folder' || item.type === 'folder' : true;
  const parentFolder = !isFolder && 'folder_id' in item && item.folder_id ? folders.find(f => f.id === item.folder_id) : null;

  const { data: participants = [], isLoading: isLoadingMembers } = useQuery<FolderParticipantInfo[]>({
    queryKey: ['folder-participants', item.id],
    queryFn: async () => {
      return await invoke<FolderParticipantInfo[]>('cmd_get_folder_participants', { folderId: item.id });
    },
    enabled: isFolder && item.id > 0,
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>

        <div className="flex items-center gap-3 mb-5 border-b border-telegram-border/20 pb-4">
          <div className="p-3 rounded-2xl bg-telegram-primary/10 border border-telegram-primary/20 text-telegram-primary shrink-0">
            {isFolder ? <Folder className="w-6 h-6" /> : <FileTypeIcon filename={item.name} className="w-6 h-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-telegram-text truncate">{item.name}</h3>
            <p className="text-xs text-telegram-subtext mt-0.5">{isFolder ? 'Telegram Folder' : ('mime_type' in item ? item.mime_type : 'File')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-telegram-hover/30 text-telegram-subtext hover:text-telegram-text transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs text-telegram-text">
          {!isFolder && 'size' in item && (
            <div className="flex justify-between py-1.5 border-b border-telegram-border/20">
              <span className="text-telegram-subtext font-medium">File Size</span>
              <span className="font-mono font-semibold text-telegram-text">{formatBytes(item.size)}</span>
            </div>
          )}

          <div className="flex justify-between py-1.5 border-b border-telegram-border/20">
            <span className="text-telegram-subtext font-medium">Location</span>
            <span className="font-semibold text-telegram-text">{parentFolder ? parentFolder.name : 'My Drive'}</span>
          </div>

          {'created_at' in item && item.created_at && (
            <div className="flex justify-between py-1.5 border-b border-telegram-border/20">
              <span className="text-telegram-subtext font-medium">Date Added</span>
              <span className="font-mono font-semibold text-telegram-text">{item.created_at}</span>
            </div>
          )}

          <div className="flex justify-between py-1.5 border-b border-telegram-border/20">
            <span className="text-telegram-subtext font-medium">Type</span>
            <span className="font-semibold text-telegram-text">{isFolder ? 'Folder' : ('mime_type' in item ? item.mime_type : 'File')}</span>
          </div>
        </div>

        {isFolder && item.id > 0 && (
          <div className="mt-5 pt-4 border-t border-telegram-border/30 space-y-3">
            <h4 className="text-xs font-bold text-telegram-primary uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4" />
              Folder Members ({participants.length})
            </h4>

            {isLoadingMembers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-telegram-primary" />
              </div>
            ) : participants.length === 0 ? (
              <p className="text-xs text-telegram-subtext italic">Private Telegram Folder</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {participants.map((p, idx) => {
                  const initials = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase() || '?';
                  return (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-2xl bg-telegram-hover/20 border border-telegram-border/30">
                      <div className="w-8 h-8 rounded-full bg-telegram-primary/20 border border-telegram-primary/30 flex items-center justify-center text-telegram-primary text-xs font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-telegram-text truncate">
                          {p.first_name} {p.last_name || ''}
                        </p>
                        {p.username && <p className="text-[10px] text-telegram-subtext truncate">@{p.username}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SortFilterSheet({
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  fileTypeFilter,
  setFileTypeFilter,
  onClose,
}: {
  sortField: 'name' | 'size' | 'date';
  setSortField: (field: 'name' | 'size' | 'date') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void;
  fileTypeFilter: 'all' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'document';
  setFileTypeFilter: (filter: 'all' | 'pdf' | 'image' | 'video' | 'audio' | 'archive' | 'document') => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-lg bg-telegram-surface border border-telegram-border/40 rounded-t-3xl p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-300 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-telegram-text/20" />
        </div>

        <div className="flex items-center justify-between border-b border-telegram-border/20 pb-3">
          <h3 className="text-sm font-bold text-telegram-text flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-telegram-primary" />
            Sort & Filter Options
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-telegram-hover/30 text-telegram-subtext hover:text-telegram-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-telegram-primary uppercase tracking-wider">Sort By</label>
          <div className="grid grid-cols-3 gap-2">
            {(['name', 'size', 'date'] as const).map(field => (
              <button
                key={field}
                onClick={() => setSortField(field)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize transition cursor-pointer ${sortField === field ? 'bg-telegram-primary text-black font-bold shadow' : 'bg-telegram-hover/20 text-telegram-text hover:bg-telegram-hover/40 border border-telegram-border/20'}`}
              >
                {field}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-telegram-primary uppercase tracking-wider">Order</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSortOrder('asc')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${sortOrder === 'asc' ? 'bg-telegram-primary text-black font-bold shadow' : 'bg-telegram-hover/20 text-telegram-text hover:bg-telegram-hover/40 border border-telegram-border/20'}`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              Ascending
            </button>
            <button
              onClick={() => setSortOrder('desc')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${sortOrder === 'desc' ? 'bg-telegram-primary text-black font-bold shadow' : 'bg-telegram-hover/20 text-telegram-text hover:bg-telegram-hover/40 border border-telegram-border/20'}`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Descending
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-telegram-primary uppercase tracking-wider">Filter File Type</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'all', label: 'All Files' },
              { id: 'pdf', label: 'PDFs' },
              { id: 'image', label: 'Images' },
              { id: 'video', label: 'Videos' },
              { id: 'audio', label: 'Audio' },
              { id: 'archive', label: 'Archives' },
              { id: 'document', label: 'Documents' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setFileTypeFilter(item.id as any)}
                className={`py-2 px-2.5 rounded-xl text-xs font-semibold truncate transition cursor-pointer ${fileTypeFilter === item.id ? 'bg-telegram-primary text-black font-bold shadow' : 'bg-telegram-hover/20 text-telegram-text hover:bg-telegram-hover/40 border border-telegram-border/20'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-telegram-primary text-black font-bold text-xs hover:bg-telegram-primary/90 shadow transition cursor-pointer"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}
