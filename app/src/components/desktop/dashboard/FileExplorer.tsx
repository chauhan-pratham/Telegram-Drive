import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Folder, MoreVertical, Loader2, Users, Star } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSettings } from '../../../context/SettingsContext';
import { FileCard } from './FileCard';
import { EmptyState } from './EmptyState';
import { TelegramFile, TelegramFolder } from '../../../types';
import { ContextMenu } from './ContextMenu';
import { FileListItem } from './FileListItem';
import { useDrive } from '../../../context/DriveContext';
import { formatBytes, createDragGhost } from '../../../utils';

type SortField = 'name' | 'size' | 'date';

interface FileExplorerProps {
    files: TelegramFile[];
    loading: boolean;
    error: Error | null;
    viewMode: 'grid' | 'list';
    selectedIds: number[];
    activeFolderId: number | null;
    onFileClick: (e: React.MouseEvent, id: number, orderedFiles: TelegramFile[]) => void;
    onDelete: (id: number) => void;
    onDownload: (id: number, name: string) => void;
    onPreview: (file: TelegramFile, orderedFiles?: TelegramFile[]) => void;
    onManualUpload: () => void;
    onFolderUpload: () => void;
    showFolderUpload: boolean;
    onToggleSelection: (id: number) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileIds: number[]) => void;
    onDragEnd?: () => void;
    onShare?: (file: TelegramFile) => void;
    onRename?: (file: TelegramFile) => void;
    onFileMove?: (file: TelegramFile) => void;
    folders?: TelegramFolder[];
    mutatingFolderIds?: number[];
    onFolderOpen?: (id: number) => void;
    onSelectionChange?: (ids: number[]) => void;
    onExportInvite?: (id: number, name: string) => void;
    onFolderRename?: (id: number, name: string) => void;
    onDownloadFolderById?: (id: number, name: string) => void;
}


function useGridColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [columns, setColumns] = useState(4);
    const [containerWidth, setContainerWidth] = useState(800);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateColumns = () => {
            const el = containerRef.current;
            if (!el) return;
            // clientWidth includes padding — subtract it so card size
            // calculations match the actual grid content area.
            const cs = getComputedStyle(el);
            const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const width = el.clientWidth - padX;
            setContainerWidth(width > 0 ? width : 800);
            if (width < 640) setColumns(2);
            else if (width < 768) setColumns(3);
            else if (width < 1024) setColumns(4);
            else if (width < 1280) setColumns(5);
            else setColumns(6);
        };

        updateColumns();
        const observer = new ResizeObserver(updateColumns);
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [containerRef]);

    return { columns, containerWidth };
}

export function FileExplorer({
    files, loading, error, viewMode, selectedIds, activeFolderId,
    onFileClick, onDelete, onDownload, onPreview, onManualUpload, onFolderUpload: _onFolderUpload, showFolderUpload: _showFolderUpload, onToggleSelection, onDrop, onDragStart, onDragEnd, onShare, onRename, onFileMove,
    folders = [], mutatingFolderIds = [], onFolderOpen, onSelectionChange, onExportInvite, onFolderRename, onDownloadFolderById
}: FileExplorerProps) {
    const cardScale = 1.0;
    const { currentTab, sortField, setSortField, sortDirection, setSortDirection, isFolderStarred } = useDrive();
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: TelegramFile } | null>(null);
    const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);
    const { settings } = useSettings();

    const parentRef = useRef<HTMLDivElement>(null);
    const { columns: baseColumns, containerWidth } = useGridColumns(parentRef);

    // Scale columns by cardScale: higher scale = fewer columns = larger cards
    const columns = Math.max(1, Math.round(baseColumns / cardScale));

    const GAP = 6;
    const cardWidth = (containerWidth - (GAP * (columns - 1))) / columns;
    const cardHeight = cardWidth * 0.75; // aspect-[4/3]

    // Lasso Selection States
    const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Only trigger on left-click on background elements
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        const isBg = target === parentRef.current || target.classList.contains('lasso-bg') || target.tagName === 'NAV';
        if (!isBg) return;

        e.preventDefault();
        const rect = parentRef.current!.getBoundingClientRect();
        const startX = e.clientX - rect.left + parentRef.current!.scrollLeft;
        const startY = e.clientY - rect.top + parentRef.current!.scrollTop;

        dragStartPos.current = { x: startX, y: startY };
        setIsSelecting(true);
        setSelectionBox({ left: startX, top: startY, width: 0, height: 0 });
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isSelecting || !selectionBox || !parentRef.current) return;

        const parent = parentRef.current;
        const rect = parent.getBoundingClientRect();
        const currentX = e.clientX - rect.left + parent.scrollLeft;
        const currentY = e.clientY - rect.top + parent.scrollTop;

        const startX = dragStartPos.current.x;
        const startY = dragStartPos.current.y;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(startX - currentX);
        const height = Math.abs(startY - currentY);

        setSelectionBox({ left, top, width, height });

        // Check intersections with elements containing data-file-id
        const cardElements = parent.querySelectorAll('[data-file-id]');
        const intersectedIds: number[] = [];

        cardElements.forEach((el) => {
            const cardEl = el as HTMLElement;
            const fileId = parseInt(cardEl.getAttribute('data-file-id') || '', 10);
            if (isNaN(fileId)) return;

            const cardRect = cardEl.getBoundingClientRect();
            const cardLeft = cardRect.left - rect.left + parent.scrollLeft;
            const cardTop = cardRect.top - rect.top + parent.scrollTop;
            const cardWidth = cardRect.width;
            const cardHeight = cardRect.height;

            const intersects = (
                left < cardLeft + cardWidth &&
                left + width > cardLeft &&
                top < cardTop + cardHeight &&
                top + height > cardTop
            );

            if (intersects) {
                intersectedIds.push(fileId);
            }
        });

        onSelectionChange?.(intersectedIds);
    }, [isSelecting, selectionBox, onSelectionChange]);

    const handleMouseUp = useCallback(() => {
        setIsSelecting(false);
        setSelectionBox(null);
    }, []);

    const sortedFiles = useMemo(() => {
        return [...files].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name, settings.language, { numeric: true, sensitivity: 'base' });
                    break;
                case 'size':
                    comparison = (a.size || 0) - (b.size || 0);
                    break;
                case 'date':
                    comparison = (a.created_at || '').localeCompare(b.created_at || '');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [files, sortField, sortDirection, settings.language]);

    const handleContextMenu = useCallback((e: React.MouseEvent, file: TelegramFile) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedIds.includes(file.id)) {
            onFileClick(e, file.id, sortedFiles);
        }
        setContextMenu(prev => prev?.file.id === file.id ? null : { x: e.clientX, y: e.clientY, file });
    }, [selectedIds, onFileClick, sortedFiles]);

    const sortedFolders = useMemo(() => {
        if (!folders) return [];
        return [...folders].sort((a, b) => {
            if (a.id === -999) return -1;
            if (b.id === -999) return 1;

            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name, settings.language, { numeric: true, sensitivity: 'base' });
                    break;
                default:
                    comparison = a.name.localeCompare(b.name, settings.language, { numeric: true, sensitivity: 'base' });
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [folders, sortField, sortDirection, settings.language]);

    const handlePreviewRequest = useCallback((file: TelegramFile) => {
        onPreview(file, sortedFiles);
    }, [onPreview, sortedFiles]);

    const currentTabFolders = useMemo(() => {
        if (currentTab === 'starred') {
            // displayFolders is already pre-filtered to starred folders by DesktopDashboard
            return sortedFolders;
        }
        if (currentTab !== 'my-drive' && currentTab !== 'trash') return [];
        return sortedFolders.filter(f => {
            if (activeFolderId === null) {
                return !f.parent_id || f.parent_id === 0;
            } else {
                return f.parent_id === activeFolderId;
            }
        });
    }, [sortedFolders, currentTab, activeFolderId]);

    const showFoldersList = currentTabFolders.length > 0;

    const gridRows = useMemo(() => {
        const rows: TelegramFile[][] = [];
        for (let i = 0; i < sortedFiles.length; i += columns) {
            rows.push(sortedFiles.slice(i, i + columns));
        }
        return rows;
    }, [sortedFiles, columns]);

    const listItems = useMemo(() => {
        return sortedFiles;
    }, [sortedFiles]);

    const gridVirtualizer = useVirtualizer({
        count: gridRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => cardHeight, [cardHeight]),
        overscan: 2,
        gap: GAP,
    });

    const listVirtualizer = useVirtualizer({
        count: listItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
    });

    useEffect(() => {
        if (parentRef.current) {
            parentRef.current.scrollTop = 0;
        }
        gridVirtualizer.scrollToOffset(0);
        listVirtualizer.scrollToOffset(0);
    }, [activeFolderId, gridVirtualizer, listVirtualizer]);

    // Remeasure the grid virtualizer when columns or cardHeight changes to prevent overlapping
    useEffect(() => {
        gridVirtualizer.measure();
    }, [columns, cardHeight, gridVirtualizer]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'date' ? 'desc' : 'asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
        return sortDirection === 'asc'
            ? <ArrowUp className="w-3 h-3 text-telegram-primary" />
            : <ArrowDown className="w-3 h-3 text-telegram-primary" />;
    };

    if (loading) {
        return (
            <div className="flex-1 p-6 flex justify-center items-center text-telegram-subtext flex-col gap-4">
                <div className="w-8 h-8 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin"></div>
                Loading your files...
            </div>
        );
    }

    if (error) {
        return <div className="flex-1 p-6 flex justify-center items-center text-red-400">Error loading files</div>;
    }

    if (files.length === 0 && !showFoldersList) {
        return (
            <div className="flex-1 p-6 overflow-auto">
                <EmptyState onUpload={onManualUpload} tab={currentTab} />
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="flex-1 p-6 overflow-auto custom-scrollbar select-none relative lasso-bg"
        >
            {/* Selection overlay box */}
            {selectionBox && (
                <div
                    className="absolute border border-telegram-primary bg-telegram-primary/10 rounded pointer-events-none z-40 transition-all duration-75"
                    style={{
                        left: `${selectionBox.left}px`,
                        top: `${selectionBox.top}px`,
                        width: `${selectionBox.width}px`,
                        height: `${selectionBox.height}px`,
                    }}
                />
            )}
            {/* Folders Section (Google Drive Style) */}
            {showFoldersList && (
                <div className="mb-8 lasso-bg">
                    <h3 className="text-xs font-bold text-telegram-subtext uppercase tracking-wider mb-3">Folders</h3>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {currentTabFolders.map(folder => {
                                const isMutating = mutatingFolderIds.includes(folder.id);
                                const isDragOver = dragOverFolderId === folder.id;
                                return (
                                    <div
                                        key={folder.id}
                                        draggable={folder.id !== -999}
                                        onDragStart={(e) => {
                                            if (folder.id === -999) return;
                                            e.dataTransfer.setData("application/x-telegram-folder-id", folder.id.toString());
                                            e.dataTransfer.effectAllowed = 'move';
                                            const ghost = createDragGhost(folder.name, true, 1);
                                            e.dataTransfer.setDragImage(ghost, 0, 0);
                                            requestAnimationFrame(() => ghost.remove());
                                        }}
                                        onDragOver={(e) => {
                                            if (!selectedIds.includes(folder.id)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setDragOverFolderId(folder.id);
                                            }
                                        }}
                                        onDragLeave={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                                        }}
                                        onDrop={(e) => {
                                            if (!selectedIds.includes(folder.id)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setDragOverFolderId(null);
                                                onDrop?.(e, folder.id);
                                            }
                                        }}
                                        onDoubleClick={() => {
                                            if (onFolderOpen) onFolderOpen(folder.id);
                                        }}
                                        onContextMenu={(e) => {
                                            if (folder.id !== -999) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (!selectedIds.includes(folder.id)) {
                                                    onFileClick(e, folder.id, []);
                                                }
                                                setContextMenu({
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    file: {
                                                        id: folder.id,
                                                        name: folder.name,
                                                        type: 'folder',
                                                        size: 0,
                                                        sizeStr: '--',
                                                        date: '',
                                                        mime_type: 'folder',
                                                        isFolder: true,
                                                    } as any as TelegramFile
                                                });
                                            }
                                        }}
                                        className={`flex items-center justify-between gap-3 p-3.5 border border-telegram-border/20 rounded-2xl transition-all relative ${
                                            isMutating
                                                ? 'pointer-events-none opacity-60 cursor-not-allowed bg-telegram-hover/20'
                                                : 'cursor-pointer bg-telegram-hover/40 hover:bg-telegram-hover hover:border-telegram-primary/30 shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
                                        } ${
                                            selectedIds.includes(folder.id)
                                                ? 'border-telegram-primary bg-telegram-primary/10 ring-1 ring-telegram-primary'
                                                : ''
                                        } ${
                                            isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20' : ''
                                        }`}
                                        onClick={(e) => {
                                            if (folder.id !== -999) {
                                                onFileClick(e, folder.id, []);
                                            } else {
                                                e.stopPropagation();
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {isMutating ? (
                                                <Loader2 className="w-5 h-5 text-telegram-primary shrink-0 animate-spin" />
                                            ) : (
                                                <div className="relative shrink-0">
                                                    <Folder className="w-5 h-5 text-telegram-primary shrink-0 fill-telegram-primary/25" strokeWidth={1.8} />
                                                    {folder.is_shared && (
                                                        <div className="absolute -bottom-1 -right-1 bg-telegram-surface border border-telegram-border/50 rounded-full p-0.5 shadow-sm flex items-center justify-center">
                                                            <Users className="w-2.5 h-2.5 text-telegram-primary" strokeWidth={2} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <span className="text-xs font-semibold text-telegram-text truncate">{folder.name}</span>
                                            {isFolderStarred(folder.id) && (
                                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Starred" />
                                            )}
                                        </div>
                                        {!isMutating && folder.id !== -999 && (
                                            <button 
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-telegram-hover/60 rounded-full transition-opacity text-telegram-subtext hover:text-telegram-text cursor-pointer flex-shrink-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!selectedIds.includes(folder.id)) {
                                                        onFileClick(e, folder.id, []);
                                                    }
                                                    const folderAsFile = {
                                                        id: folder.id,
                                                        name: folder.name,
                                                        size: 0,
                                                        type: 'folder',
                                                        date: '',
                                                        mime_type: 'folder',
                                                        isFolder: true,
                                                    } as any as TelegramFile;
                                                    setContextMenu(prev => prev?.file.id === folder.id ? null : { x: e.clientX, y: e.clientY, file: folderAsFile });
                                                }}
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {currentTabFolders.map(folder => {
                                const isMutating = mutatingFolderIds.includes(folder.id);
                                const isDragOver = dragOverFolderId === folder.id;
                                const folderFiles = files.filter(f => f.folder_id === folder.id || (folder.id === -999 && (f.folder_id === null || f.folder_id === -999)));
                                const folderSize = folderFiles.reduce((acc, f) => acc + (f.size || 0), 0);
                                const folderItemCount = folderFiles.length;

                                const sizeLabel = folderSize > 0 
                                    ? formatBytes(folderSize) 
                                    : folderItemCount > 0 
                                        ? `${folderItemCount} item${folderItemCount !== 1 ? 's' : ''}` 
                                        : 'Empty';

                                const dateOrStatusLabel = (folder as any).created_at 
                                    ? new Date((folder as any).created_at).toLocaleDateString()
                                    : folder.id === -999 
                                        ? 'Default' 
                                        : folder.is_shared 
                                            ? 'Shared' 
                                            : `${folderItemCount} item${folderItemCount !== 1 ? 's' : ''}`;

                                return (
                                    <div
                                        key={folder.id}
                                        draggable={folder.id !== -999}
                                        onDragStart={(e) => {
                                            if (folder.id === -999) return;
                                            e.dataTransfer.setData("application/x-telegram-folder-id", folder.id.toString());
                                            e.dataTransfer.effectAllowed = 'move';
                                            const ghost = createDragGhost(folder.name, true, 1);
                                            e.dataTransfer.setDragImage(ghost, 0, 0);
                                            requestAnimationFrame(() => ghost.remove());
                                        }}
                                        onDragOver={(e) => {
                                            if (!selectedIds.includes(folder.id)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setDragOverFolderId(folder.id);
                                            }
                                        }}
                                        onDragLeave={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                                        }}
                                        onDrop={(e) => {
                                            if (!selectedIds.includes(folder.id)) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setDragOverFolderId(null);
                                                onDrop?.(e, folder.id);
                                            }
                                        }}
                                        onDoubleClick={() => { if (onFolderOpen) onFolderOpen(folder.id); }}
                                        onContextMenu={(e) => {
                                            if (folder.id !== -999) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (!selectedIds.includes(folder.id)) {
                                                    onFileClick(e, folder.id, []);
                                                }
                                                setContextMenu(prev => {
                                                    if (prev?.file.id === folder.id) return null;
                                                    return {
                                                        x: e.clientX,
                                                        y: e.clientY,
                                                        file: {
                                                            id: folder.id,
                                                            name: folder.name,
                                                            size: 0,
                                                            type: 'folder',
                                                            date: '',
                                                            mime_type: 'folder',
                                                            isFolder: true,
                                                        } as any as TelegramFile
                                                    };
                                                });
                                            }
                                        }}
                                        className={`group grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] sm:grid-cols-[2rem_minmax(0,2fr)_6.5rem_11rem_2.5rem] gap-4 items-center px-4 py-3 rounded-lg border border-transparent transition-all ${
                                            isMutating
                                                ? 'pointer-events-none opacity-60 cursor-not-allowed'
                                                : 'cursor-pointer hover:bg-telegram-hover'
                                        } ${
                                            selectedIds.includes(folder.id) ? 'bg-telegram-primary/10 border-telegram-primary/20' : ''
                                        } ${
                                            isDragOver ? 'ring-2 ring-telegram-primary bg-telegram-primary/20' : ''
                                        }`}
                                        onClick={(e) => {
                                            if (folder.id !== -999) {
                                                onFileClick(e, folder.id, []);
                                            } else {
                                                e.stopPropagation();
                                            }
                                        }}
                                    >
                                        <div className="flex justify-center">
                                            {isMutating ? (
                                                <Loader2 className="w-5 h-5 text-telegram-primary animate-spin" />
                                            ) : (
                                                <div className="relative shrink-0">
                                                    <Folder className="w-5 h-5 text-telegram-primary fill-telegram-primary/20" strokeWidth={1.8} />
                                                    {folder.is_shared && (
                                                        <div className="absolute -bottom-1 -right-1 bg-telegram-surface border border-telegram-border/50 rounded-full p-0.5 shadow-sm flex items-center justify-center">
                                                            <Users className="w-2.5 h-2.5 text-telegram-primary" strokeWidth={2} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 truncate text-sm text-telegram-text font-medium flex items-center gap-2">
                                            <span className="truncate">{folder.name}</span>
                                            {isFolderStarred(folder.id) && (
                                                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Starred" />
                                            )}
                                        </div>
                                        <div className="hidden sm:block text-xs text-telegram-subtext text-right tabular-nums">{sizeLabel}</div>
                                        <div className="hidden sm:block text-xs text-telegram-subtext text-right tabular-nums">{dateOrStatusLabel}</div>
                                        <div className="flex justify-end relative">
                                            {!isMutating && folder.id !== -999 && (
                                                <button 
                                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-telegram-hover/60 rounded-full transition-opacity text-telegram-subtext hover:text-telegram-text cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onFileClick(e, folder.id, []);
                                                        const folderAsFile = {
                                                            id: folder.id,
                                                            name: folder.name,
                                                            size: 0,
                                                            type: 'folder',
                                                            date: '',
                                                            mime_type: 'folder',
                                                            isFolder: true,
                                                        } as any as TelegramFile;
                                                        setContextMenu(prev => prev?.file.id === folder.id ? null : { x: e.clientX, y: e.clientY, file: folderAsFile });
                                                    }}
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
                </div>
            )}

            {/* Files Section Title if Folders are present */}
            {showFoldersList && sortedFiles.length > 0 && (
                <h3 className="text-xs font-bold text-telegram-subtext uppercase tracking-wider mb-3">Files</h3>
            )}

            {sortedFiles.length > 0 || !showFoldersList ? (
                viewMode === 'grid' ? (
                    <>
                        <div
                            className="relative w-full lasso-bg"
                            style={{ height: `${gridVirtualizer.getTotalSize()}px` }}
                        >
                            {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                                const row = gridRows[virtualRow.index];
                                return (
                                    <div
                                        key={virtualRow.key}
                                        className="absolute top-0 left-0 w-full grid lasso-bg"
                                        style={{
                                            height: `${cardHeight}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                            gap: `${GAP}px`,
                                        }}
                                    >
                                        {row.map((file) => {
                                            return (
                                                <div
                                                    key={file.id}
                                                    data-file-id={file.id}
                                                    onDoubleClick={() => handlePreviewRequest(file)}
                                                >
                                                    <FileCard
                                                        file={file}
                                                        isSelected={selectedIds.includes(file.id)}
                                                        onClick={(e) => onFileClick(e, file.id, sortedFiles)}
                                                        onContextMenu={(e) => handleContextMenu(e, file)}
                                                        onDelete={() => onDelete(file.id)}
                                                        onDownload={() => onDownload(file.id, file.name)}
                                                        onPreview={() => handlePreviewRequest(file)}
                                                        onDrop={onDrop}
                                                        onDragStart={onDragStart}
                                                        onDragEnd={onDragEnd}
                                                        activeFolderId={activeFolderId}
                                                        height={cardHeight}
                                                        onToggleSelection={() => onToggleSelection(file.id)}
                                                        onShare={onShare ? () => onShare(file) : undefined}
                                                        selectedIds={selectedIds}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col w-full lasso-bg">
                        {/* List Header */}
                        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] sm:grid-cols-[2rem_minmax(0,2fr)_6.5rem_11rem_2.5rem] gap-4 px-4 py-2 text-xs font-semibold text-telegram-subtext border-b border-telegram-border/40 mb-2 select-none items-center lasso-bg">
                            <div className="text-center">#</div>
                            <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-telegram-text transition-colors min-w-0">
                                <span className="truncate">Name</span> <SortIcon field="name" />
                            </button>
                            <button onClick={() => handleSort('size')} className="hidden sm:flex items-center gap-1 justify-end hover:text-telegram-text transition-colors text-right">
                                Size <SortIcon field="size" />
                            </button>
                            <button onClick={() => handleSort('date')} className="hidden sm:flex items-center gap-1 justify-end hover:text-telegram-text transition-colors text-right">
                                Date <SortIcon field="date" />
                            </button>
                            <div className="w-10"></div>
                        </div>

                        <div
                            className="relative w-full lasso-bg"
                            style={{ height: `${listVirtualizer.getTotalSize()}px` }}
                        >
                            {listVirtualizer.getVirtualItems().map((virtualItem) => {
                                const file = listItems[virtualItem.index];
                                return (
                                    <div
                                        key={file.id}
                                        data-file-id={file.id}
                                        className="absolute top-0 left-0 w-full"
                                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                                        onDoubleClick={() => handlePreviewRequest(file)}
                                    >
                                        <FileListItem
                                            file={file}
                                            selectedIds={selectedIds}
                                            onFileClick={(e, id) => onFileClick(e, id, sortedFiles)}
                                            handleContextMenu={handleContextMenu}
                                            onDragStart={onDragStart}
                                            onDragEnd={onDragEnd}
                                            onDrop={onDrop}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
            ) : null}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={contextMenu.file}
                    onClose={() => setContextMenu(null)}
                    onDownload={() => {
                        if (contextMenu.file.type === 'folder') {
                            if (onDownloadFolderById) {
                                onDownloadFolderById(contextMenu.file.id, contextMenu.file.name);
                            }
                        } else {
                            onDownload(contextMenu.file.id, contextMenu.file.name);
                        }
                        setContextMenu(null);
                    }}
                    onDelete={() => {
                        onDelete(contextMenu.file.id);
                        setContextMenu(null);
                    }}
                    onPreview={() => {
                        if (contextMenu.file.type === 'folder') {
                             onFileClick({ preventDefault: () => { }, stopPropagation: () => { } } as React.MouseEvent, contextMenu.file.id, sortedFiles);
                        } else {
                            handlePreviewRequest(contextMenu.file);
                        }
                        setContextMenu(null);
                    }}
                    onShare={onShare ? () => {
                        onShare(contextMenu.file);
                        setContextMenu(null);
                    } : undefined}
                    onRename={() => {
                        if (contextMenu.file.type === 'folder') {
                            if (onFolderRename) {
                                onFolderRename(contextMenu.file.id, contextMenu.file.name);
                            }
                        } else if (onRename) {
                            onRename(contextMenu.file);
                        }
                        setContextMenu(null);
                    }}
                    onMove={onFileMove ? () => {
                        onFileMove(contextMenu.file);
                        setContextMenu(null);
                    } : undefined}
                    onExportInvite={onExportInvite}
                    folders={folders}
                    activeFolderId={activeFolderId}
                />
            )}
        </div>
    )
}
