import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load, type Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder, FolderInviteInfo } from '../types';
import { useNetworkStatus } from './useNetworkStatus';
import { useDrive } from '../context/DriveContext';

export function useTelegramConnection(onLogoutParent: () => void) {
    const AUTO_FOLDER_SYNC_INTERVAL_MS = 30 * 60 * 1000;
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const { folders, setFolders } = useDrive();
    const [mutatingFolderIds, setMutatingFolderIds] = useState<Set<number>>(new Set());
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const networkIsOnline = useNetworkStatus();
    const handleSyncFoldersRef = useRef<((silentParam?: boolean | unknown) => Promise<void>) | null>(null);


    // Load persisted store and restore saved folders.
    useEffect(() => {
        const initStore = async () => {
            try {
                let _store = await load('config.json');
                const checkId = await _store.get<string>('api_id');
                if (!checkId) {
                    _store = await load('settings.json');
                }
                setStore(_store);

                // Fetch local-first SQLite enriched folders
                try {
                    const dbFolders = await invoke<TelegramFolder[]>('cmd_get_enriched_folders');
                    if (dbFolders && dbFolders.length > 0) {
                        setFolders(dbFolders);
                    } else {
                        const savedFolders = await _store.get<TelegramFolder[]>('folders');
                        if (savedFolders) setFolders(savedFolders);
                    }
                } catch {
                    const savedFolders = await _store.get<TelegramFolder[]>('folders');
                    if (savedFolders) setFolders(savedFolders);
                }

                const savedActiveFolderId = await _store.get<number | null>('activeFolderId');
                if (savedActiveFolderId !== undefined) setActiveFolderId(savedActiveFolderId);

                setIsConnected(true);
                queryClient.invalidateQueries({ queryKey: ['files'] });
            } catch {
                // store not available
            }
        };
        initStore();
    }, [queryClient]);

    // Consolidated mount-sync + visibility-change listener
    useEffect(() => {
        if (!store || !isConnected) return;

        const syncAndRefresh = async () => {
            if (!handleSyncFoldersRef.current) return;
            const lastSyncAt = await store.get<number>('lastFolderSyncAt') ?? 0;
            if (Date.now() - lastSyncAt < AUTO_FOLDER_SYNC_INTERVAL_MS) {
                return;
            }
            await handleSyncFoldersRef.current(true);
            queryClient.invalidateQueries({ queryKey: ['files'] });
        };

        syncAndRefresh();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncAndRefresh();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [store, isConnected, queryClient]);

    useEffect(() => {
        setIsConnected(networkIsOnline);
    }, [networkIsOnline]);

    const handleLogout = async () => {
        if (!await confirm({ title: "Sign Out", message: "Are you sure you want to sign out? This will disconnect your active session.", confirmText: "Sign Out", variant: 'danger' })) return;

        try {
            await invoke('cmd_logout');
            await invoke('cmd_clean_cache');
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
            onLogoutParent();
        } catch {
            toast.error("Error signing out");
            onLogoutParent();
        }
    };

    const handleSyncFolders = async (silentParam?: boolean | unknown) => {
        const silent = silentParam === true;
        if (!store) return;
        setIsSyncing(true);
        try {
            const foundFolders = await invoke<TelegramFolder[]>('cmd_scan_folders');

            // Clean up localStorage shared list for folders that are either no longer shared or no longer exist
            const savedSharedStr = localStorage.getItem('shared_folder_ids');
            if (savedSharedStr) {
                let sharedIds: number[] = JSON.parse(savedSharedStr);
                const originalCount = sharedIds.length;
                sharedIds = sharedIds.filter(id => {
                    const matchedFolder = foundFolders.find(f => f.id === id);
                    if (!matchedFolder) return false; // Folder no longer exists in Telegram scan
                    if (matchedFolder.participants_count !== undefined && matchedFolder.participants_count !== null && matchedFolder.participants_count <= 1) {
                        return false; // Only owner is left
                    }
                    return true;
                });
                if (sharedIds.length !== originalCount) {
                    localStorage.setItem('shared_folder_ids', JSON.stringify(sharedIds));
                }
            }

            setFolders(foundFolders);
            await store.set('folders', foundFolders);
            await store.set('lastFolderSyncAt', Date.now());
            await store.save();
            if (!silent) {
                toast.success("Folders synchronized.");
            }
        } catch (e) {
            if (!silent) {
                toast.error("Sync failed: " + e);
            }
        } finally {
            setIsSyncing(false);
        }
    };

    // Keep the ref in sync
    handleSyncFoldersRef.current = handleSyncFolders;

    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
            await store.save();
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await invoke<TelegramFolder>('cmd_create_folder', { name });
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error("Failed to create folder: " + e);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string, bypassConfirm = false) => {
        if (!bypassConfirm && !await confirm({
            title: "Delete Folder",
            message: `Are you sure you want to delete "${folderName}"?\nThis will delete the channel on Telegram.`,
            confirmText: "Delete",
            variant: 'danger'
        })) return;

        try {
            setMutatingFolderIds(prev => {
                const next = new Set(prev);
                next.add(folderId);
                return next;
            });
            await invoke('cmd_delete_folder', { folderId });
            
            const savedSharedStr = localStorage.getItem('shared_folder_ids');
            if (savedSharedStr) {
                const sharedIds: number[] = JSON.parse(savedSharedStr);
                const updatedSharedIds = sharedIds.filter(id => id !== folderId);
                localStorage.setItem('shared_folder_ids', JSON.stringify(updatedSharedIds));
            }

            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
        } catch (e: unknown) {
            const errStr = String(e);
            if (errStr.includes("not found")) {
                if (await confirm({
                    title: "Folder Not Found",
                    message: `Folder "${folderName}" not found on Telegram (it may have been deleted externally).\nRemove from this app?`,
                    confirmText: "Remove",
                    variant: 'info'
                })) {
                    const updated = folders.filter(f => f.id !== folderId);
                    setFolders(updated);
                    if (store) {
                        await store.set('folders', updated);
                        await store.save();
                    }
                    if (activeFolderId === folderId) setActiveFolderId(null);
                }
            } else {
                toast.error(`Failed to delete folder: ${e}`);
            }
        } finally {
            setMutatingFolderIds(prev => {
                const next = new Set(prev);
                next.delete(folderId);
                return next;
            });
        }
    };

    const handleFolderRename = async (folderId: number, oldName: string, newNameOverride?: string) => {
        const newName = newNameOverride?.trim();
        if (!newName || newName === oldName) return;

        try {
            setMutatingFolderIds(prev => {
                const next = new Set(prev);
                next.add(folderId);
                return next;
            });
            await invoke('cmd_rename_folder', { folderId, newName });
            const updated = folders.map(f => f.id === folderId ? { ...f, name: newName } : f);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            toast.success(`Folder renamed to "${newName}".`);
        } catch (e) {
            toast.error("Failed to rename folder: " + e);
        } finally {
            setMutatingFolderIds(prev => {
                const next = new Set(prev);
                next.delete(folderId);
                return next;
            });
        }
    };

    const handleFolderToggleVisibility = async (folderId: number, makePublic: boolean, desiredUsername?: string) => {
        if (!makePublic) {
            const confirmed = await confirm({
                title: "Make Private",
                message: "Making this channel private will remove its public username. Any shared t.me links will stop working immediately.",
                confirmText: "Make Private",
                variant: 'danger'
            });
            if (!confirmed) return;
        } else {
            const confirmed = await confirm({
                title: "Make Folder Public?",
                message: "WARNING: Making this folder public will assign it a public username. Anyone on Telegram can find and download all files in this folder. Are you sure you want to proceed?",
                confirmText: "Make Public",
                variant: 'danger'
            });
            if (!confirmed) return;
        }
        try {
            const updated = await invoke<TelegramFolder>('cmd_toggle_folder_visibility', {
                folderId,
                makePublic,
                desiredUsername: desiredUsername || null,
            });
            const newFolders = folders.map(f =>
                f.id === folderId ? { ...f, username: updated.username, is_public: updated.is_public } : f
            );
            setFolders(newFolders);
            if (store) {
                await store.set('folders', newFolders);
                await store.save();
            }
            toast.success(makePublic ? 'Channel is now public' : 'Channel is now private');
            return updated;
        } catch (e) {
            toast.error(`Failed to toggle visibility: ${e}`);
            throw e;
        }
    };

    const handleExportFolderInvite = async (folderId: number): Promise<FolderInviteInfo> => {
        try {
            const info = await invoke<FolderInviteInfo>('cmd_export_folder_invite', {
                folderId,
            });

            const savedSharedStr = localStorage.getItem('shared_folder_ids');
            const sharedIds: number[] = savedSharedStr ? JSON.parse(savedSharedStr) : [];
            if (!sharedIds.includes(folderId)) {
                sharedIds.push(folderId);
                localStorage.setItem('shared_folder_ids', JSON.stringify(sharedIds));
            }

            const updated = folders.map(f => {
                if (f.id === folderId) {
                    return {
                        ...f,
                        is_public: info.is_public,
                        username: info.username || f.username,
                    };
                }
                return f;
            });
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            return info;
        } catch (e) {
            toast.error(`Failed to get invite link: ${e}`);
            throw e;
        }
    };

    const handleReorderFolders = async (reordered: TelegramFolder[]) => {
        setFolders(reordered);
        if (store) {
            await store.set('folders', reordered);
            await store.save();
        }
        try {
            await Promise.all(
                reordered.map((folder, index) =>
                    invoke('cmd_update_folder_order', { channelId: folder.id, newOrder: index })
                )
            );
        } catch (e) {
            console.error("Failed to persist folder reordering:", e);
        }
    };

    const enrichedFolders = useMemo(() => {
        const savedSharedStr = localStorage.getItem('shared_folder_ids');
        const sharedIds: number[] = savedSharedStr ? JSON.parse(savedSharedStr) : [];
        return folders.map(f => {
            const isSharedWithMe = f.is_owned === false;
            
            // If we have an explicit participant count, let it dominate:
            // if participants_count <= 1, then it's NOT shared by members (only the owner is in the channel).
            // otherwise, we check if participants_count > 1, or fall back to sharedIds registry.
            const isSharedByMembers = f.participants_count !== undefined && f.participants_count !== null
                ? f.participants_count > 1
                : sharedIds.includes(f.id);

            return {
                ...f,
                is_shared_with_me: isSharedWithMe,
                is_shared: f.is_public || !!f.username || isSharedWithMe || isSharedByMembers,
            };
        });
    }, [folders]);

    // Background refresh of participant counts when at the root folder level
    useEffect(() => {
        let active = true;
        if (folders.length > 0 && isConnected && activeFolderId === null) {
            const checkParticipants = async () => {
                for (const folder of folders) {
                    if (!active) return;
                    if (folder.id === -999) continue;
                    try {
                        const participants = await invoke<any[]>('cmd_get_folder_participants', { folderId: folder.id });
                        if (!active) return;
                        const liveCount = participants.length;
                        
                        setFolders(prev => prev.map(f => {
                            if (f.id === folder.id) {
                                if (f.participants_count !== liveCount) {
                                    return { ...f, participants_count: liveCount };
                                }
                            }
                            return f;
                        }));

                        const hasJoinedMembers = participants.some(p => !p.is_creator);
                        const savedSharedStr = localStorage.getItem('shared_folder_ids');
                        let sharedIds: number[] = savedSharedStr ? JSON.parse(savedSharedStr) : [];
                        
                        if (hasJoinedMembers) {
                            if (!sharedIds.includes(folder.id)) {
                                sharedIds.push(folder.id);
                                localStorage.setItem('shared_folder_ids', JSON.stringify(sharedIds));
                            }
                        } else {
                            if (sharedIds.includes(folder.id)) {
                                sharedIds = sharedIds.filter(id => id !== folder.id);
                                localStorage.setItem('shared_folder_ids', JSON.stringify(sharedIds));
                            }
                        }
                    } catch (e) {
                        const errStr = String(e);
                        // If client is not connected yet, schedule a retry after 2.5 seconds
                        if (errStr.includes("NOT_CONNECTED") || errStr.includes("not connected")) {
                            setTimeout(() => {
                                if (active) checkParticipants();
                            }, 2500);
                            return;
                        }
                        
                        console.error("Failed to refresh participants for folder", folder.id, e);
                        
                        // If it fails with access errors (meaning user left/removed from channel), clean it up from localStorage
                        if (errStr.includes("CHANNEL_PUBLIC_GROUP_NA") || errStr.includes("CHANNEL_PRIVATE") || errStr.includes("not found") || errStr.includes("NotFound") || errStr.includes("ChatNotFound")) {
                            const savedSharedStr = localStorage.getItem('shared_folder_ids');
                            if (savedSharedStr) {
                                let sharedIds: number[] = JSON.parse(savedSharedStr);
                                if (sharedIds.includes(folder.id)) {
                                    sharedIds = sharedIds.filter(id => id !== folder.id);
                                    localStorage.setItem('shared_folder_ids', JSON.stringify(sharedIds));
                                }
                            }
                        }
                    }
                }
            };
            checkParticipants();
        }
        return () => {
            active = false;
        };
    }, [folders.length, isConnected, activeFolderId]);

    return {
        store,
        folders: enrichedFolders,
        activeFolderId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        handleFolderRename,
        handleFolderToggleVisibility,
        handleExportFolderInvite,
        handleReorderFolders,
        mutatingFolderIds,
    };
}
