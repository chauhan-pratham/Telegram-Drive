import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QueueItem } from '../types';
import { isAndroidPlatform, showFileDialogFallback, pickWithFallback } from '../utils';
import { useSettings } from '../context/SettingsContext';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
    uploaded_bytes: number;
    total_bytes: number;
    speed_bytes_per_sec: number;
}

export function useFileUpload(activeFolderId: number | null, store: Store | null) {
    const queryClient = useQueryClient();
    const { settings } = useSettings();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const activeCountRef = useRef(0);
    const cancelledRef = useRef<Set<string>>(new Set());

    // Listen for progress events from Rust
    useEffect(() => {
        let unlistenProgress: UnlistenFn | undefined;

        listen<ProgressPayload>('upload-progress', (event) => {
            setUploadQueue(q => q.map(i =>
                i.id === event.payload.id ? {
                    ...i,
                    progress: event.payload.percent,
                    uploadedBytes: event.payload.uploaded_bytes,
                    totalBytes: event.payload.total_bytes,
                    speedBytesPerSec: event.payload.speed_bytes_per_sec,
                } : i
            ));
        }).then(fn => { unlistenProgress = fn; });

        return () => {
            unlistenProgress?.();
        };
    }, []);

    useEffect(() => {
        if (!store || initialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setUploadQueue(pending);
                    toast.info(`Restored ${pending.length} pending uploads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const pending = uploadQueue.filter(i => i.status === 'pending');
        store.set('uploadQueue', pending).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    const processingIdsRef = useRef<Set<string>>(new Set());

    // Process up to maxConcurrentUploads in parallel
    useEffect(() => {
        const maxConcurrent = settings.maxConcurrentUploads || 1;
        const available = maxConcurrent - activeCountRef.current;
        if (available <= 0) return;
        const pendingItems = uploadQueue
            .filter(i => i.status === 'pending' && !processingIdsRef.current.has(i.id))
            .slice(0, available);
        for (const item of pendingItems) {
            processItem(item);
        }
    }, [uploadQueue, settings.maxConcurrentUploads]);

    // Manage Android Foreground Service for persistent uploads
    useEffect(() => {
        if (!isAndroidPlatform) return;

        const hasActiveUploads = uploadQueue.some(i => i.status === 'uploading' || i.status === 'pending');
        if (hasActiveUploads) {
            invoke('cmd_start_foreground_service').catch(() => {});
        } else if (initialized) {
            invoke('cmd_stop_foreground_service').catch(() => {});
        }
    }, [uploadQueue, initialized]);

    /** Clean up temp zip file if the item was created from a folder */
    const cleanupTempZip = async (item: QueueItem) => {
        if (item.tempZipPath) {
            try {
                await invoke('cmd_delete_temp_zip', { path: item.tempZipPath });
            } catch {
                // Best-effort cleanup
            }
        }
    };

    const processItem = async (item: QueueItem) => {
        if (processingIdsRef.current.has(item.id)) return;
        processingIdsRef.current.add(item.id);

        activeCountRef.current++;
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
        try {
            const actualFolderId = item.folderId === -999 ? null : item.folderId;
            await invoke('cmd_upload_file', { path: item.path, folderId: actualFolderId, transferId: item.id });
            // Check if cancelled during upload
            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
                
                // Auto-clear successful upload from queue after 3 seconds
                setTimeout(() => {
                    setUploadQueue(q => q.filter(i => i.id !== item.id));
                }, 3000);
            }
            // Clean up temp zip on success
            await cleanupTempZip(item);
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                const errMsg = String(e);
                if (errMsg.includes('Transfer cancelled')) {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'cancelled' } : i));
                } else if (errMsg.includes('FILE_TOO_BIG') || errMsg.includes('too large') || errMsg.includes('2 GB')) {
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed: Telegram has a 2 GB file size limit. Try splitting large folders.`);
                } else {
                    const displayPath = item.url || item.path;
                    setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Upload failed for ${displayPath.split(/[/\\]/).pop()}: ${e}`);
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
            // Clean up temp zip even on failure
            await cleanupTempZip(item);
        } finally {
            activeCountRef.current--;
            processingIdsRef.current.delete(item.id);
        }
    };

    /** Queues a set of file paths for upload with strict normalized path deduplication */
    const queueFiles = (paths: string[]) => {
        if (!paths || paths.length === 0) return;

        const normalizePath = (p: string) => p.trim().replace(/\\/g, '/').replace(/^file:\/\/\/?/i, '').toLowerCase();

        setUploadQueue(prev => {
            const existingNormalized = new Set(
                prev
                    .filter(item => item.status === 'pending' || item.status === 'uploading')
                    .map(item => normalizePath(item.path))
            );

            const seenNew = new Set<string>();
            const filteredPaths: string[] = [];

            for (const p of paths) {
                if (!p) continue;
                const norm = normalizePath(p);
                if (!existingNormalized.has(norm) && !seenNew.has(norm)) {
                    seenNew.add(norm);
                    filteredPaths.push(p);
                }
            }

            if (filteredPaths.length === 0) {
                console.log('[useFileUpload] Ignored duplicate file queue request for already queued paths:', paths);
                return prev;
            }

            const newItems: QueueItem[] = filteredPaths.map((path: string) => ({
                id: Math.random().toString(36).substr(2, 9),
                path,
                folderId: activeFolderId,
                status: 'pending' as const,
            }));

            toast.info(`Queued ${filteredPaths.length} file${filteredPaths.length !== 1 ? 's' : ''} for upload`);
            return [...prev, ...newItems];
        });
    };

    const handleManualUpload = async () => {
        const paths = await pickWithFallback(
            async () => {
                const selected = await open({ multiple: true, directory: false });
                if (!selected) return null;
                return Array.isArray(selected) ? selected : [selected];
            },
            () => handleManualUpload(),
            {
                errorTitle: 'File picker failed',
                onBrowserPicker: async () => {
                    const fallbackPaths = await showFileDialogFallback({ directory: false, multiple: true });
                    return fallbackPaths.length > 0 ? fallbackPaths : null;
                },
            },
        );
        if (paths && paths.length > 0) {
            queueFiles(paths);
        }
    };

    /** Queue files dropped from the OS file manager (drag-and-drop upload) */
    const handleDropUpload = (paths: string[]) => {
        if (!paths || paths.length === 0) return;
        queueFiles(paths);
    };

    const handleFolderUpload = async () => {
        const folderPath = await pickWithFallback(
            async () => {
                const selected = await open({ multiple: false, directory: true, title: 'Select Folder to Upload' });
                if (!selected) return null;
                const fp = Array.isArray(selected) ? selected[0] : selected;
                return fp || null;
            },
            () => handleFolderUpload(),
            {
                errorTitle: 'Folder picker failed',
                onBrowserPicker: async () => {
                    const fallbackPaths = await showFileDialogFallback({ directory: true, multiple: true });
                    if (fallbackPaths.length > 0) {
                        // HTML folder picker returns individual file paths, not a folder path.
                        // We can't zip without a folder path, so files upload individually.
                        toast.info('Folder zipping unavailable with browser picker — uploading files individually.');
                        queueFiles(fallbackPaths);
                    }
                    return null; // Already handled via queueFiles — signal that the main flow should stop
                },
            },
        );
        if (!folderPath) return;

        const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || 'folder';

        if (settings.zipFolders) {
            toast.info(`Zipping "${folderName}"...`);
            try {
                const zipPath = await invoke<string>('cmd_zip_folder', { folderPath });
                const item: QueueItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    path: zipPath,
                    folderId: activeFolderId,
                    status: 'pending',
                    tempZipPath: zipPath,
                };
                setUploadQueue(prev => [...prev, item]);
                toast.success(`Queued "${folderName}.zip" for upload`);
            } catch (e) {
                console.error('[Upload] Zip error:', e);
                toast.error(`Failed to zip folder: ${e}`);
            }
        } else {
            toast.info(`Folder upload without zipping is not supported. Enable "Zip folders before upload" in Settings.`);
        }
    };

    const cancelAll = () => {
        setUploadQueue(q => {
            const activeItems = q.filter(i => i.status === 'uploading' || i.status === 'downloading');
            for (const item of activeItems) {
                cancelledRef.current.add(item.id);
                invoke('cmd_cancel_transfer', { transferId: item.id }).catch(() => {});
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => (i.status === 'uploading' || i.status === 'downloading') ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    };

    const cancelItem = (id: string) => {
        setUploadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'uploading' || item?.status === 'downloading') {
                cancelledRef.current.add(id);
                invoke('cmd_cancel_transfer', { transferId: id }).catch(() => {});
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            // Remove pending items directly
            if (item?.status === 'pending') {
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    };

    const retryItem = (id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                : i
        ));
    };

    return {
        uploadQueue,
        setUploadQueue,
        handleManualUpload,
        handleFolderUpload,
        handleDropUpload,
        cancelAll,
        cancelItem,
        retryItem,
    };
}
