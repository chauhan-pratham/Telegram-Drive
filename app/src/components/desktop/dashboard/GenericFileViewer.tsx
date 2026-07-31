import { useState, useEffect, useMemo } from 'react';
import { 
    X, 
    ChevronLeft, 
    ChevronRight, 
    Download, 
    Trash2, 
    ExternalLink, 
    File, 
    Share2, 
    Loader2,
    FolderArchive,
    ShieldAlert
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../../types';
import { formatBytes, isExecutableFile } from '../../../utils';

interface GenericFileViewerProps {
    file: TelegramFile;
    activeFolderId: number | null;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    onDownload?: (file: TelegramFile) => void;
    onShare?: (file: TelegramFile) => void;
    onDelete?: (file: TelegramFile) => void;
}

export function GenericFileViewer({
    file,
    activeFolderId,
    onClose,
    onNext,
    onPrev,
    currentIndex,
    totalItems,
    onDownload,
    onShare,
    onDelete,
}: GenericFileViewerProps) {
    const [openingExternal, setOpeningExternal] = useState(false);
    const [localPath, setLocalPath] = useState<string | null>(null);
    const [securityBlocked, setSecurityBlocked] = useState(false);

    const ext = useMemo(() => {
        const parts = file.name.split('.');
        return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
    }, [file.name]);

    const isExecutable = useMemo(() => {
        return isExecutableFile(file.name, file.mime_type);
    }, [file.name, file.mime_type]);

    const isBlocked = isExecutable || securityBlocked;

    const isArchive = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext);

    // Handle Open in System Viewer (Lazy download on demand - Blocked for executables)
    const handleOpenExternally = async () => {
        if (isBlocked) {
            return;
        }

        setOpeningExternal(true);
        try {
            let path = localPath;
            if (!path) {
                path = await invoke<string>('cmd_get_preview', {
                    messageId: file.id,
                    folderId: activeFolderId
                });
                if (path) setLocalPath(path);
            }
            if (path) {
                // Pre-flight Kernel Security Verification (Inspect magic bytes on disk)
                const sec = await invoke<{ is_executable: boolean; detected_type: string }>('cmd_check_file_security', {
                    path,
                    mime: file.mime_type
                });

                if (sec.is_executable) {
                    setSecurityBlocked(true);
                    return;
                }

                await invoke('cmd_open_file_externally', { path });
            }
        } catch (err: any) {
            console.error("Failed to open file externally:", err);
            const msg = typeof err === 'string' ? err : err?.message || "Failed to open file.";
            if (msg.toLowerCase().includes("security") || msg.toLowerCase().includes("executable")) {
                setSecurityBlocked(true);
            }
        } finally {
            setOpeningExternal(false);
        }
    };

    // Keyboard shortcuts (Enter -> Open in System App if non-executable, Esc -> Close, Arrow keys -> Navigation)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'Enter' && !isBlocked) {
                e.preventDefault();
                handleOpenExternally();
            } else if (e.key === 'ArrowRight' && onNext) {
                onNext();
            } else if (e.key === 'ArrowLeft' && onPrev) {
                onPrev();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev, localPath, isBlocked]);

    return (
        <div 
            className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Header Toolbar */}
            <div 
                className="w-full flex items-center justify-between px-4 py-3 bg-[#161619] border-b border-white/10 shrink-0 shadow-lg text-white"
                onClick={e => e.stopPropagation()}
            >
                {/* Left File Title & Icon */}
                <div className="flex items-center gap-3 min-w-0">
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                        title="Close (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center gap-2 min-w-0">
                        {isBlocked ? (
                            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
                        ) : isArchive ? (
                            <FolderArchive className="w-5 h-5 text-amber-400 shrink-0" />
                        ) : (
                            <File className="w-5 h-5 text-telegram-primary shrink-0" />
                        )}
                        <h2 className="text-sm font-semibold truncate text-white" title={file.name}>
                            {file.name}
                        </h2>
                    </div>

                    {totalItems && totalItems > 1 && currentIndex !== undefined && (
                        <span className="text-xs text-telegram-subtext hidden sm:inline-block ml-1">
                            ({currentIndex + 1} of {totalItems})
                        </span>
                    )}
                </div>

                {/* Right Quick Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Download */}
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-1.5 rounded-lg text-telegram-subtext hover:text-white hover:bg-white/10 transition cursor-pointer"
                            title="Download File"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    )}

                    {/* Share */}
                    {onShare && (
                        <button
                            onClick={() => onShare(file)}
                            className="p-1.5 rounded-lg text-telegram-subtext hover:text-white hover:bg-white/10 transition cursor-pointer"
                            title="Share File"
                        >
                            <Share2 className="w-5 h-5" />
                        </button>
                    )}

                    {/* Delete */}
                    {onDelete && (
                        <button
                            onClick={() => onDelete(file)}
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/20 transition cursor-pointer"
                            title="Delete File"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Arrows */}
            {onPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-xl border border-white/10"
                    title="Previous item"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {onNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-xl border border-white/10"
                    title="Next item"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            {/* Main Center Stage Card */}
            <div 
                className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto"
            >
                <div 
                    className="w-full max-w-lg bg-[#141417] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Background Decorative Glow */}
                    <div className={`absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none ${isBlocked ? 'bg-red-500' : isArchive ? 'bg-amber-500' : 'bg-telegram-primary'}`} />

                    {/* Large Format App Icon */}
                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-xl relative z-10 ${
                        isBlocked 
                            ? 'bg-red-500/15 border border-red-500/30 text-red-400' 
                            : isArchive 
                                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400' 
                                : 'bg-telegram-primary/15 border border-telegram-primary/30 text-telegram-primary'
                    }`}>
                        {isBlocked ? (
                            <ShieldAlert className="w-10 h-10" />
                        ) : isArchive ? (
                            <FolderArchive className="w-10 h-10" />
                        ) : (
                            <File className="w-10 h-10" />
                        )}
                    </div>

                    {/* File Title & Metadata */}
                    <h3 className="text-lg font-bold text-white mb-2 break-all max-w-full px-2" title={file.name}>
                        {file.name}
                    </h3>
                    
                    <div className="flex items-center justify-center gap-2 mb-6 text-xs text-telegram-subtext">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase ${isBlocked ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white'}`}>
                            {isBlocked ? (securityBlocked ? 'DISGUISED EXECUTABLE BINARY' : 'EXECUTABLE PROGRAM') : (ext || 'FILE')}
                        </span>
                        <span>•</span>
                        <span>{formatBytes(file.size)}</span>
                    </div>

                    {/* Executable Security Alert Message */}
                    {isBlocked && (
                        <div className="w-full bg-red-500/10 border border-red-500/25 rounded-2xl p-4 mb-6 text-left text-xs text-red-300 flex gap-3 items-start">
                            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <div className="leading-relaxed">
                                <strong className="text-red-200 block mb-0.5">Security Protection Active</strong>
                                For your security, executable files cannot be opened directly from Telegram-Drive. Download the file to your computer to inspect and run it using your OS antivirus.
                            </div>
                        </div>
                    )}

                    {/* Action 1: Download File Direct */}
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className={`w-full py-3.5 px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-xl transition-all transform active:scale-[0.99] cursor-pointer mb-3 ${
                                isBlocked
                                    ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20'
                                    : 'bg-telegram-primary hover:bg-telegram-primary/90 text-black shadow-telegram-primary/20'
                            }`}
                        >
                            <Download className="w-4.5 h-4.5" />
                            <span>Download File ({formatBytes(file.size)})</span>
                        </button>
                    )}

                    {/* Action 2: Open in System Viewer (Only rendered for NON-BLOCKED files) */}
                    {!isBlocked && (
                        <button
                            onClick={handleOpenExternally}
                            disabled={openingExternal}
                            className="w-full py-3 px-6 bg-white/10 hover:bg-white/15 text-white border border-white/10 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] cursor-pointer disabled:opacity-50 mb-4"
                        >
                            {openingExternal ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-telegram-primary" />
                                    <span>Downloading & Opening...</span>
                                </>
                            ) : (
                                <>
                                    <ExternalLink className="w-4.5 h-4.5 text-telegram-primary" />
                                    <span>Open in System Viewer</span>
                                </>
                            )}
                        </button>
                    )}

                    <p className="text-xs text-telegram-subtext">
                        {isBlocked ? (
                            <span>Click <strong className="text-white">Download</strong> to save this executable safely to your local computer.</span>
                        ) : (
                            <span>Click <strong className="text-white">Download</strong> to save directly to your PC, or <strong className="text-white">Open in System Viewer</strong> to view in File Explorer.</span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
