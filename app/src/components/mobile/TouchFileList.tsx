import { useRef, useState, useCallback } from 'react';
import { DownloadCloud, Trash2, Pencil, X, Check, MoreVertical, Eye, Copy, Star, CheckCircle2, FolderOpen, Loader2 } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MobileFileThumbnail } from './MobileFileThumbnail';
import { ActionPopover, ActionItem } from './ActionPopover';
import { TelegramFile, TelegramFolder } from '../../types';
import { formatDate } from '../../utils';
import { useDrive } from '../../context/DriveContext';

interface TouchFileListProps {
  files: TelegramFile[];
  isLoading: boolean;
  onDownload: (file: TelegramFile) => void;
  onDelete: (file: TelegramFile) => void;
  onPreview: (file: TelegramFile) => void;
  onRename: (file: TelegramFile) => void;
  selectedIds: number[];
  onToggleSelection: (id: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkDownload: () => void;
  onBulkMove: (targetFolderId: number | null) => void;
  onBulkShare?: () => void;
  onShare?: (file: TelegramFile) => void;
  onCopyTelegramLink?: (file: TelegramFile) => void;
  folders: TelegramFolder[];
  activeFolderId: number | null;
  mutatingFolderIds?: number[];
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  viewMode?: 'grid' | 'list';
  hideEmptyState?: boolean;
}

export function TouchFileList({
  files, isLoading, onDownload, onDelete, onPreview, onRename,
  selectedIds, onToggleSelection, onSelectAll: _onSelectAll, onClearSelection: _onClearSelection,
  onBulkDelete: _onBulkDelete, onBulkDownload: _onBulkDownload, onBulkMove, onBulkShare: _onBulkShare, onShare: _onShare,
  onCopyTelegramLink, folders, activeFolderId, mutatingFolderIds: _mutatingFolderIds = [],
  scrollContainerRef, viewMode = 'grid', hideEmptyState = false
}: TouchFileListProps) {
  const [selectionMode] = useState(false);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const parentRef = scrollContainerRef || fallbackRef;

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 10,
  });
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [actionMenuFile, setActionMenuFile] = useState<TelegramFile | null>(null);
  const isSelectionActive = selectionMode || selectedIds.length > 0;

  // Long-press detection refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const LONG_PRESS_DURATION = 500;

  // Long-press handlers — defined BEFORE any early returns to satisfy Rules of Hooks.
  // On Android, long-press opens the action popover (file options menu).
  const handlePointerDown = useCallback((e: React.PointerEvent, file: TelegramFile) => {
    if (isSelectionActive) return;
    longPressFiredRef.current = false;
    longPressPosRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // Haptic feedback — short vibration pulse (Web Vibration API, supported in Android WebView)
      navigator.vibrate?.(15);
      setActionMenuFile(file);
    }, LONG_PRESS_DURATION);
  }, [isSelectionActive]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressPosRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - longPressPosRef.current.x);
    const dy = Math.abs(e.clientY - longPressPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      longPressPosRef.current = null;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressPosRef.current = null;
  }, []);

  const { isStarred, starFile, unstarFile, isOffline, getOfflineState, makeAvailableOffline, removeOfflineAccess } = useDrive();

  // Build action items for a file's popover menu
  const buildFileActions = useCallback((file: TelegramFile): ActionItem[] => {
    const starred = isStarred(file.id);
    const offlineState = getOfflineState(file.id);
    const offlineLabel = offlineState.isDownloading 
      ? `Downloading (${offlineState.progress}%)`
      : (offlineState.isReady ? 'Remove offline access' : 'Make available offline');

    const actions: ActionItem[] = [
      {
        label: 'Preview',
        icon: <Eye className="w-4 h-4" />,
        onClick: () => onPreview(file),
      },
      {
        label: starred ? 'Remove Star' : 'Add Star',
        icon: <Star className={`w-4 h-4 ${starred ? 'text-amber-400 fill-amber-400' : ''}`} />,
        onClick: () => starred ? unstarFile(file.id) : starFile(file),
      },
      {
        label: offlineLabel,
        icon: offlineState.isDownloading ? (
          <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
        ) : (
          <CheckCircle2 className={`w-4 h-4 ${offlineState.isReady ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
        ),
        onClick: () => {
          if (offlineState.isOffline) {
            removeOfflineAccess(file.id);
          } else {
            makeAvailableOffline(file);
          }
        },
      },
      {
        label: 'Download',
        icon: <DownloadCloud className="w-4 h-4" />,
        onClick: () => onDownload(file),
      },
      {
        label: 'Rename',
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => onRename(file),
      },
    ];
    // Telegram native t.me link (only for public folders)
    if (file.type !== 'folder' && onCopyTelegramLink) {
      const folder = folders.find(f => f.id === file.folder_id) || folders.find(f => f.id === activeFolderId);
      const username = folder?.username || (folder as any)?.chat?.username || (folder as any)?.channel?.username;
      if (username) {
        actions.push({
          label: 'Copy Telegram Link',
          icon: <Copy className="w-4 h-4" />,
          onClick: () => onCopyTelegramLink(file),
        });
      }
    }
    actions.push({
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => onDelete(file),
      destructive: true,
    });
    return actions;
  }, [onPreview, onDownload, onRename, onDelete, onCopyTelegramLink, folders, activeFolderId, isStarred, starFile, unstarFile, isOffline, makeAvailableOffline, removeOfflineAccess]);

  return (
    <>
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
          <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-telegram-primary"></div>
          <p className="text-xs text-telegram-subtext font-semibold">Retrieving your files...</p>
        </div>
      )}

      {!isLoading && files.length === 0 && !hideEmptyState && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center px-4">
          <div className="w-16 h-16 rounded-3xl bg-telegram-primary/10 border border-telegram-primary/20 text-telegram-primary flex items-center justify-center shadow-lg shadow-telegram-primary/5">
            <FolderOpen className="w-8 h-8 stroke-[1.5]" />
          </div>
          <h4 className="text-sm font-bold text-telegram-text">This folder is empty</h4>
          <p className="text-xs text-telegram-subtext max-w-xs leading-relaxed">
            Upload files or synchronise folders to begin managing content.
          </p>
        </div>
      )}

      {!isLoading && files.length > 0 && (
        <>


          {/* Move-to-folder picker modal */}
          {showMovePicker && (
            <div
              className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMovePicker(false)}
            >
              <div
                className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-5 w-[300px] max-h-[60vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Move {selectedIds.length} file{selectedIds.length !== 1 ? 's' : ''} to...</h3>
                  <button
                    onClick={() => setShowMovePicker(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                  {/* Saved Messages */}
                  <button
                    onClick={() => { onBulkMove(null); setShowMovePicker(false); }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      activeFolderId === null
                        ? 'bg-telegram-primary/10 text-telegram-primary'
                        : 'text-telegram-subtext hover:bg-white/5'
                    }`}
                  >
                    📁 Saved Messages
                  </button>
                  {folders
                    .filter(f => f.id !== activeFolderId)
                    .map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => { onBulkMove(folder.id); setShowMovePicker(false); }}
                        className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold text-telegram-subtext hover:bg-white/5 transition-all duration-200"
                      >
                        📁 {folder.name}
                      </button>
                    ))}
                  {folders.filter(f => f.id !== activeFolderId).length === 0 && (
                    <p className="text-xs text-telegram-subtext/60 text-center py-4">No other folders available</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* File list — renders Grid View or virtualized List View based on viewMode */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3.5 pb-20">
              {files.map((file) => {
                const isSelected = selectedIds.includes(file.id);
                return (
                  <div
                    key={file.id}
                    onPointerDown={(e) => handlePointerDown(e, file)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onClick={() => {
                      if (longPressFiredRef.current) {
                        longPressFiredRef.current = false;
                        return;
                      }
                      if (isSelectionActive) {
                        onToggleSelection(file.id);
                      } else {
                        onPreview(file);
                      }
                    }}
                    className={`flex flex-col justify-between p-3 bg-telegram-surface/80 border rounded-3xl cursor-pointer hover:bg-telegram-hover/40 active:scale-[0.98] transition-all shadow-sm relative group overflow-hidden ${
                      isSelected ? 'border-telegram-primary bg-telegram-primary/10' : 'border-telegram-border/40'
                    }`}
                  >
                    {/* Card Preview / Icon Display Area */}
                    <div className="w-full h-24 rounded-2xl bg-telegram-bg/80 border border-telegram-border/20 flex items-center justify-center overflow-hidden relative">
                      {isSelectionActive && (
                        <div className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-telegram-primary border-telegram-primary text-black'
                            : 'border-telegram-border/50 bg-black/40'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      )}
                      <MobileFileThumbnail file={file} folderId={activeFolderId} iconSize="md" className="w-full h-full object-cover" />
                    </div>

                    {/* Card Bottom Meta Info Row */}
                    <div className="flex items-center justify-between pt-2 px-0.5 gap-1 min-w-0">
                      <div className="flex flex-col min-w-0 flex-1">
                        <p className="text-xs font-semibold text-telegram-text truncate leading-tight">{file.name}</p>
                        <p className="text-[10px] text-telegram-subtext/80 font-mono truncate mt-0.5">{file.sizeStr}</p>
                      </div>
                      {!isSelectionActive && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuFile(file);
                          }}
                          className="p-1 rounded-full text-telegram-subtext/70 hover:text-telegram-text shrink-0"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div 
              className="relative w-full pb-20"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const file = files[virtualItem.index];
                const isSelected = selectedIds.includes(file.id);

                return (
                  <div
                    key={file.id}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingBottom: '10px',
                    }}
                  >
                    <div
                      onPointerDown={(e) => handlePointerDown(e, file)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onClick={() => {
                        if (longPressFiredRef.current) {
                          longPressFiredRef.current = false;
                          return;
                        }
                        if (isSelectionActive) {
                          onToggleSelection(file.id);
                        } else {
                          onPreview(file);
                        }
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl bg-telegram-hover/15 border transition-all duration-200 cursor-pointer active:bg-telegram-hover/35 ${
                        isSelected ? 'border-telegram-primary/50 bg-telegram-primary/10' : 'border-telegram-border/20'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-telegram-bg/60 border border-telegram-border/20 flex items-center justify-center">
                          <MobileFileThumbnail file={file} folderId={activeFolderId} iconSize="sm" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-telegram-text truncate max-w-[170px] leading-snug">{file.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-telegram-subtext/80 font-medium font-mono">{file.sizeStr}</span>
                            <span className="w-1 h-1 bg-telegram-border rounded-full" />
                            <span className="text-[10px] text-telegram-subtext/80 font-medium">{formatDate(file.created_at)}</span>
                            {(() => {
                              const offState = getOfflineState(file.id);
                              if (offState.isDownloading) {
                                return (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded animate-pulse" title={`Downloading (${offState.progress}%)`}>
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    {offState.progress}%
                                  </span>
                                );
                              }
                              if (offState.isReady) {
                                return (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-400" title="Available offline">
                                    <CheckCircle2 className="w-3 h-3 fill-emerald-400/20" />
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Circle Checkbox when selection active OR 3-dots action menu */}
                      {isSelectionActive ? (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 shrink-0 ${
                          isSelected
                            ? 'bg-telegram-primary border-telegram-primary text-black shadow-xs'
                            : 'border-white/40 bg-transparent'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      ) : (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuFile(file);
                          }}
                          className="flex-shrink-0 p-2 rounded-xl hover:bg-telegram-hover/40 active:bg-telegram-hover/60 text-telegram-subtext/60 hover:text-telegram-subtext transition-all duration-200"
                          aria-label="File actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Action popover for file operations */}
      {actionMenuFile && (
        <ActionPopover
          title={actionMenuFile.name}
          actions={buildFileActions(actionMenuFile)}
          onClose={() => setActionMenuFile(null)}
        />
      )}
    </>
  );
}
