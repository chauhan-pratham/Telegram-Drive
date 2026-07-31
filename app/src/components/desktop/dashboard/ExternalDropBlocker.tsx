import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle2 } from 'lucide-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { DragDropOverlay } from './DragDropOverlay';

/**
 * ExternalDropBlocker - Intercepts external file drops and triggers uploads directly.
 * 
 * Listens to native Tauri webview dragDropEvents (which provide full OS file paths)
 * as well as DOM drag/drop events. Passes extracted paths to onFilesDropped callback.
 */
export function ExternalDropBlocker({ onFilesDropped, onUploadClick }: { onFilesDropped?: (paths: string[]) => void; onUploadClick?: () => void }) {
    const [isDragging, setIsDragging] = useState(false);
    const [droppedCount, setDroppedCount] = useState<number | null>(null);
    const [showFallback, setShowFallback] = useState(false);
    
    // Use refs for values accessed inside stable event listeners
    const onFilesDroppedRef = useRef(onFilesDropped);
    onFilesDroppedRef.current = onFilesDropped;

    const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const lastDropTimeRef = useRef<number>(0);
    const lastDropFingerprintRef = useRef<string>('');

    const normalizePath = (p: string) => p.trim().replace(/\\/g, '/').replace(/^file:\/\/\/?/i, '').toLowerCase();

    // Central deduplicated file drop handler
    const dispatchDroppedFiles = (paths: string[]) => {
        if (!paths || paths.length === 0) return;
        
        const normalizedPaths = paths.map(normalizePath).filter(Boolean);
        const fingerprint = normalizedPaths.slice().sort().join('|');
        const now = Date.now();

        // Suppress duplicate drop events arriving within 3000ms
        if (fingerprint === lastDropFingerprintRef.current && (now - lastDropTimeRef.current) < 3000) {
            console.log('[ExternalDropBlocker] Suppressed duplicate drop event for:', fingerprint);
            return;
        }

        lastDropTimeRef.current = now;
        lastDropFingerprintRef.current = fingerprint;

        if (onFilesDroppedRef.current) {
            onFilesDroppedRef.current(paths);
            setDroppedCount(paths.length);
            if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
            messageTimeoutRef.current = setTimeout(() => setDroppedCount(null), 2500);
        }
    };

    // Listen for native Tauri drag-drop events (provides OS absolute paths for files and folders)
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;

        (async () => {
            try {
                const webview = getCurrentWebview();
                unlisten = await webview.onDragDropEvent((event) => {
                    const payload = event.payload as any;
                    if (payload.type === 'enter' || payload.type === 'over') {
                        setIsDragging(true);
                    } else if (payload.type === 'drop') {
                        setIsDragging(false);
                        const paths = payload.paths;
                        if (paths && Array.isArray(paths) && paths.length > 0) {
                            dispatchDroppedFiles(paths);
                        }
                    } else {
                        setIsDragging(false);
                    }
                });
            } catch (e) {
                console.warn('[ExternalDropBlocker] Native onDragDropEvent setup error:', e);
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // Listen for file-dropped events emitted from Rust on_navigation handler
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;

        (async () => {
            try {
                unlisten = await listen<string>('file-dropped', (event) => {
                    const path = event.payload;
                    if (path && typeof path === 'string' && path.length > 0) {
                        dispatchDroppedFiles([path]);
                    }
                });
            } catch (e) {
                console.warn('[ExternalDropBlocker] Failed to listen for file-dropped event:', e);
            }
        })();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // DOM Drag & Drop Fallback
    useEffect(() => {
        let dragEnterCount = 0;
        let hideTimeout: ReturnType<typeof setTimeout>;

        const handleDragEnter = (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                dragEnterCount++;
                setIsDragging(true);
                clearTimeout(hideTimeout);
            }
        };

        const handleDragOver = (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                clearTimeout(hideTimeout);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('Files')) {
                dragEnterCount--;
                if (dragEnterCount <= 0 &&
                    (e.clientX <= 0 || e.clientY <= 0 ||
                     e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
                    dragEnterCount = 0;
                    hideTimeout = setTimeout(() => {
                        setIsDragging(false);
                    }, 150);
                }
            }
        };

        const handleDrop = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes('Files')) return;

            e.preventDefault();
            e.stopPropagation();
            dragEnterCount = 0;
            setIsDragging(false);
            clearTimeout(hideTimeout);

            const files = e.dataTransfer.files;
            const paths: string[] = [];

            for (let i = 0; i < files.length; i++) {
                const path = (files[i] as any).path as string | undefined;
                if (path && typeof path === 'string' && path.length > 0) {
                    paths.push(path);
                }
            }

            if (paths.length > 0) {
                dispatchDroppedFiles(paths);
            }
        };

        document.addEventListener('dragenter', handleDragEnter, true);
        document.addEventListener('dragover', handleDragOver, true);
        document.addEventListener('dragleave', handleDragLeave, true);
        document.addEventListener('drop', handleDrop, true);

        return () => {
            document.removeEventListener('dragenter', handleDragEnter, true);
            document.removeEventListener('dragover', handleDragOver, true);
            document.removeEventListener('dragleave', handleDragLeave, true);
            document.removeEventListener('drop', handleDrop, true);
            clearTimeout(hideTimeout);
            if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current);
        };
    }, []);

    return (
        <>
            {/* Drag overlay - shown while files are being dragged over the window */}
            <AnimatePresence>
                {isDragging && <DragDropOverlay />}
            </AnimatePresence>

            {/* Brief success confirmation after drop */}
            <AnimatePresence>
                {droppedCount !== null && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-20 right-4 z-[110] pointer-events-none"
                    >
                        <div className="glass bg-telegram-surface border border-green-500/30 rounded-xl p-4 flex items-center gap-3 shadow-xl">
                            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <span className="text-sm text-telegram-text">
                                Queued {droppedCount} file{droppedCount !== 1 ? 's' : ''} for upload
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Fallback message when file paths cannot be extracted */}
            <AnimatePresence>
                {showFallback && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none"
                    >
                        <div className="glass bg-telegram-surface border border-telegram-border rounded-2xl p-8 max-w-md mx-4 shadow-2xl pointer-events-auto">
                            <div className="flex flex-col items-center text-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-telegram-primary/20 flex items-center justify-center">
                                    <Upload className="w-8 h-8 text-telegram-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-telegram-text mb-2">
                                        Drag-and-drop not available
                                    </h3>
                                    <p className="text-telegram-subtext text-sm">
                                        File paths could not be read from the drag event.
                                        <br />
                                        Use the button below or the <strong>Upload File</strong> button in the toolbar.
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowFallback(false)}
                                        className="mt-2 px-4 py-2 bg-telegram-hover text-telegram-text rounded-lg text-sm hover:bg-telegram-border transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowFallback(false);
                                            onUploadClick?.();
                                        }}
                                        className="mt-2 px-6 py-2 bg-telegram-primary text-white rounded-lg font-medium hover:bg-telegram-primary/90 transition-colors"
                                    >
                                        Open Upload Dialog
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
