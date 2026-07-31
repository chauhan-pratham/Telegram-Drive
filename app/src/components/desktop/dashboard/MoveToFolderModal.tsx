import { useState, useMemo } from 'react';
import { Plus, Folder, Users, ChevronRight, Check, FolderPlus, X, Loader2 } from 'lucide-react';
import { TelegramFolder } from '../../../types';

interface MoveToFolderModalProps {
    folders: TelegramFolder[];
    onClose: () => void;
    onSelect: (id: number | null) => void;
    activeFolderId: number | null;
    fileName?: string;
    movingFolderId?: number;
    movingFolderName?: string;
    onCreateFolder?: (name: string, parentId?: number | null) => Promise<TelegramFolder | void>;
}

export function MoveToFolderModal({
    folders,
    onClose,
    onSelect,
    activeFolderId,
    fileName,
    movingFolderId,
    movingFolderName,
    onCreateFolder,
}: MoveToFolderModalProps) {

    // The currently navigated directory inside the modal (null = My Drive Root)
    const [navFolderId, setNavFolderId] = useState<number | null>(null);

    // New folder inline creation state
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [isCreatingLoading, setIsCreatingLoading] = useState(false);

    // Compute excluded folder IDs (the folder itself + any child subfolder descendants)
    const excludedFolderIds = useMemo(() => {
        if (!movingFolderId) return new Set<number>();
        const set = new Set<number>([movingFolderId]);
        let added = true;
        while (added) {
            added = false;
            for (const f of folders) {
                if (f.parent_id && set.has(f.parent_id) && !set.has(f.id)) {
                    set.add(f.id);
                    added = true;
                }
            }
        }
        return set;
    }, [movingFolderId, folders]);

    const targetName = fileName || movingFolderName;

    const movingFolderObj = useMemo(() => {
        if (!movingFolderId) return null;
        return folders.find(f => f.id === movingFolderId);
    }, [movingFolderId, folders]);

    // Current parent of the item being moved
    const currentItemParentId = movingFolderId
        ? (movingFolderObj?.parent_id ?? null)
        : (activeFolderId === -999 ? null : activeFolderId);

    // Build breadcrumb path for modal navigation
    const breadcrumbs = useMemo(() => {
        const path: Array<{ id: number | null; name: string }> = [{ id: null, name: 'My Drive' }];
        if (navFolderId === null) return path;

        let currId: number | null = navFolderId;
        const temp: Array<{ id: number; name: string }> = [];
        const visited = new Set<number>();

        while (currId !== null && !visited.has(currId)) {
            visited.add(currId);
            const found = folders.find(f => f.id === currId);
            if (!found) break;
            temp.unshift({ id: found.id, name: found.name });
            currId = found.parent_id ?? null;
        }

        return [...path, ...temp];
    }, [navFolderId, folders]);

    // Subfolders inside the currently navigated directory inside modal
    const visibleFolders = useMemo(() => {
        return folders.filter((f: TelegramFolder) => {
            // Exclude moving folder and its subfolder descendants
            if (movingFolderId && excludedFolderIds.has(f.id)) {
                return false;
            }
            // Filter by parent matching current navigated folder
            if (navFolderId === null) {
                return !f.parent_id && !f.is_shared_with_me;
            }
            return f.parent_id === navFolderId;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [folders, navFolderId, movingFolderId, excludedFolderIds]);

    // Check if "Move Here" is valid for current location
    const isSameLocation = (navFolderId === currentItemParentId);

    const handleConfirmMove = () => {
        if (isSameLocation) return;
        onSelect(navFolderId);
    };

    const handleCreateNewFolder = async () => {
        const trimmed = newFolderName.trim();
        if (!trimmed || !onCreateFolder) return;
        try {
            setIsCreatingLoading(true);
            const created = await onCreateFolder(trimmed, navFolderId);
            setIsCreatingFolder(false);
            setNewFolderName('');
            if (created) {
                setNavFolderId(created.id);
            }
        } catch {
            /* error toasted by hook */
        } finally {
            setIsCreatingLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div role="dialog" aria-modal="true" className="bg-telegram-surface border border-telegram-border rounded-xl w-96 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 border-b border-telegram-border flex justify-between items-center">
                    <h3 className="text-telegram-text font-medium truncate max-w-[280px]">
                        {targetName ? `Move "${targetName}" to...` : 'Move to folder'}
                    </h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text p-1 rounded-md transition-colors cursor-pointer">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                {/* Breadcrumbs Navigation + New Folder Action */}
                <div className="px-3 py-2 bg-telegram-hover/40 border-b border-telegram-border/50 flex items-center justify-between gap-2 overflow-x-auto text-xs scrollbar-none select-none">
                    <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
                        {breadcrumbs.map((crumb, idx) => {
                            const isLast = idx === breadcrumbs.length - 1;
                            return (
                                <div key={crumb.id ?? 'root'} className="flex items-center gap-1 shrink-0">
                                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-telegram-subtext shrink-0" />}
                                    <button
                                        onClick={() => setNavFolderId(crumb.id)}
                                        className={`transition-colors truncate max-w-[120px] ${
                                            isLast
                                                ? 'font-semibold text-telegram-primary cursor-default'
                                                : 'text-telegram-subtext hover:text-telegram-text cursor-pointer'
                                        }`}
                                    >
                                        {crumb.name}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {onCreateFolder && !isCreatingFolder && (
                        <button
                            onClick={() => setIsCreatingFolder(true)}
                            className="flex items-center gap-1 px-2 py-1 text-telegram-primary hover:bg-telegram-primary/10 rounded-md transition-colors font-medium shrink-0 cursor-pointer"
                            title="Create new folder in current directory"
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>New folder</span>
                        </button>
                    )}
                </div>

                {/* Directory Content List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[160px] max-h-[300px]">

                    {/* Inline Create Folder Input */}
                    {isCreatingFolder && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-telegram-hover/60 rounded-lg border border-telegram-primary/40 animate-in fade-in duration-150 mb-1">
                            <Folder className="w-4 h-4 text-telegram-primary shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateNewFolder();
                                    if (e.key === 'Escape') {
                                        setIsCreatingFolder(false);
                                        setNewFolderName('');
                                    }
                                }}
                                placeholder="Folder name"
                                className="flex-1 bg-telegram-surface border border-telegram-border rounded px-2 py-1 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary"
                                disabled={isCreatingLoading}
                            />
                            <button
                                onClick={handleCreateNewFolder}
                                disabled={!newFolderName.trim() || isCreatingLoading}
                                className="p-1 text-telegram-primary hover:bg-telegram-primary/10 rounded transition-colors disabled:opacity-40 cursor-pointer"
                                title="Create"
                            >
                                {isCreatingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                                onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                                className="p-1 text-telegram-subtext hover:text-telegram-text rounded transition-colors cursor-pointer"
                                disabled={isCreatingLoading}
                                title="Cancel"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {visibleFolders.map((f: TelegramFolder) => (
                        <button
                            key={f.id}
                            onClick={() => setNavFolderId(f.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left text-telegram-text hover:bg-telegram-hover transition-colors group cursor-pointer"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded bg-telegram-hover flex items-center justify-center text-telegram-text relative shrink-0 group-hover:bg-telegram-primary/10">
                                    <Folder className="w-4 h-4 text-telegram-primary" />
                                    {(f.is_shared_with_me || f.is_public || f.username) && (
                                        <div className="absolute -bottom-0.5 -right-0.5 bg-telegram-surface border border-telegram-border/50 rounded-full p-0.5 shadow-sm flex items-center justify-center">
                                            <Users className="w-2 h-2 text-telegram-primary" strokeWidth={2} />
                                        </div>
                                    )}
                                </div>
                                <span className="font-medium truncate">{f.name}</span>
                            </div>

                            <ChevronRight className="w-4 h-4 text-telegram-subtext group-hover:text-telegram-text transition-colors shrink-0" />
                        </button>
                    ))}

                    {visibleFolders.length === 0 && !isCreatingFolder && (
                        <div className="p-8 text-center text-xs text-telegram-subtext flex flex-col items-center gap-2">
                            <Folder className="w-8 h-8 text-telegram-subtext/40 stroke-1" />
                            <span>No subfolders in this folder</span>
                        </div>
                    )}
                </div>

                {/* Footer with Explicit Move Target Button & Cancel */}
                <div className="p-3 border-t border-telegram-border bg-telegram-surface flex items-center justify-between gap-3">
                    <div className="text-xs text-telegram-subtext truncate max-w-[160px]">
                        Target: <span className="font-semibold text-telegram-text">{navFolderId === null ? "My Drive" : breadcrumbs[breadcrumbs.length - 1]?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-telegram-subtext hover:text-telegram-text rounded-lg hover:bg-telegram-hover transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmMove}
                            disabled={isSameLocation}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                                isSameLocation
                                    ? 'bg-telegram-hover text-telegram-subtext cursor-not-allowed opacity-60'
                                    : 'bg-telegram-primary text-white hover:bg-telegram-primary/90 shadow-sm'
                            }`}
                        >
                            <Check className="w-3.5 h-3.5" />
                            <span>
                                {isSameLocation
                                    ? "Already in this location"
                                    : (navFolderId === null ? "Move to My Drive" : `Move to "${breadcrumbs[breadcrumbs.length - 1]?.name}"`)}
                            </span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
