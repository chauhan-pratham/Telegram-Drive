import { useState, useEffect, useRef, useMemo } from 'react';
import { 
    X, 
    ChevronLeft, 
    ChevronRight, 
    Download, 
    Trash2, 
    Copy, 
    Check, 
    Search, 
    WrapText, 
    ZoomIn, 
    ZoomOut, 
    FileText,
    Share2,
    Loader2,
    ShieldAlert
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../../types';
import { copyToClipboard, formatBytes } from '../../../utils';

interface TextViewerProps {
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

export function TextViewer({
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
}: TextViewerProps) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [wordWrap, setWordWrap] = useState(true);
    const [fontSize, setFontSize] = useState(13); // in px
    const [securityBlocked, setSecurityBlocked] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);

    // Fetch text file content when file changes
    useEffect(() => {
        let isCancelled = false;
        setLoading(true);
        setError(null);
        setContent(null);
        setSecurityBlocked(false);

        async function loadTextContent() {
            try {
                const filePath = await invoke<string>('cmd_get_preview', {
                    messageId: file.id,
                    folderId: activeFolderId
                });

                if (isCancelled) return;

                if (!filePath) {
                    throw new Error("Could not obtain file path for preview.");
                }

                // Check security magic bytes on disk
                const sec = await invoke<{ is_executable: boolean; detected_type: string }>('cmd_check_file_security', {
                    path: filePath,
                    mime: file.mime_type
                });

                if (sec.is_executable) {
                    setSecurityBlocked(true);
                    setLoading(false);
                    return;
                }

                // Read text file via Rust IPC (100% reliable across all platforms & webviews)
                const text = await invoke<string>('cmd_read_text_file', { path: filePath });

                if (!isCancelled) {
                    setContent(text);
                    setLoading(false);
                }
            } catch (err: any) {
                if (!isCancelled) {
                    console.error("TextViewer load error:", err);
                    setError(err?.message || "Failed to load text file content");
                    setLoading(false);
                }
            }
        }

        loadTextContent();

        return () => {
            isCancelled = true;
        };
    }, [file.id, activeFolderId]);

    // Handle Copy
    const handleCopy = async () => {
        if (!content) return;
        await copyToClipboard(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowRight' && onNext) {
                onNext();
            } else if (e.key === 'ArrowLeft' && onPrev) {
                onPrev();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    const lines = useMemo(() => {
        if (content === null) return [];
        return content.split('\n');
    }, [content]);

    // Search match count
    const matchCount = useMemo(() => {
        if (!searchQuery.trim() || !content) return 0;
        const q = searchQuery.toLowerCase();
        let count = 0;
        let pos = 0;
        const lower = content.toLowerCase();
        while ((pos = lower.indexOf(q, pos)) !== -1) {
            count++;
            pos += q.length;
        }
        return count;
    }, [searchQuery, content]);

    if (securityBlocked) {
        return (
            <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200" onClick={onClose}>
                {/* Header Toolbar */}
                <div className="w-full flex items-center justify-between px-4 py-3 bg-[#161619] border-b border-white/10 shrink-0 text-white" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer" title="Close (Esc)">
                            <X className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2">
                            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
                            <h2 className="text-sm font-semibold truncate text-white">{file.name}</h2>
                        </div>
                    </div>
                </div>

                {/* Main Security Warning Container */}
                <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
                    <div className="w-full max-w-lg bg-[#141417] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none bg-red-500" />
                        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-xl bg-red-500/15 border border-red-500/30 text-red-400">
                            <ShieldAlert className="w-10 h-10" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2 break-all">{file.name}</h3>
                        <div className="flex items-center justify-center gap-2 mb-6 text-xs text-telegram-subtext">
                            <span className="px-2.5 py-0.5 rounded-full font-bold uppercase bg-red-500/20 text-red-300">
                                DISGUISED EXECUTABLE BINARY
                            </span>
                            <span>•</span>
                            <span>{formatBytes(file.size)}</span>
                        </div>
                        <div className="w-full bg-red-500/10 border border-red-500/25 rounded-2xl p-4 mb-6 text-left text-xs text-red-300 flex gap-3 items-start leading-relaxed">
                            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <div>
                                <strong className="text-red-200 block mb-0.5">Security Protection Active</strong>
                                This file contains executable binary code (<code className="font-mono bg-red-950/80 px-1 py-0.5 rounded">MZ</code> header) disguised as a text file. Direct launching is blocked for your protection.
                            </div>
                        </div>
                        {onDownload && (
                            <button onClick={() => onDownload(file)} className="w-full py-3.5 px-6 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer">
                                <Download className="w-4.5 h-4.5" />
                                <span>Download File ({formatBytes(file.size)})</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div 
            className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Top Toolbar */}
            <div 
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#161619] border-b border-white/10 shrink-0 shadow-lg text-white"
                onClick={e => e.stopPropagation()}
            >
                {/* Left File Title & Controls */}
                <div className="flex items-center gap-3 min-w-0">
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                        title="Close preview (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-5 h-5 text-telegram-primary shrink-0" />
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

                {/* Right Actions & Tools */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Search Bar */}
                    <div className="relative flex items-center hidden md:flex">
                        <Search className="w-3.5 h-3.5 text-telegram-subtext absolute left-2.5 pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Find in file (Ctrl+F)..."
                            className="bg-black/40 border border-white/10 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-telegram-subtext focus:outline-none focus:border-telegram-primary/60 w-44 transition-all focus:w-56"
                        />
                        {searchQuery && (
                            <span className="absolute right-2 text-[10px] font-mono text-telegram-primary font-bold">
                                {matchCount}
                            </span>
                        )}
                    </div>

                    {/* Word Wrap Toggle */}
                    <button
                        onClick={() => setWordWrap(!wordWrap)}
                        className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 ${wordWrap ? 'bg-telegram-primary/20 text-telegram-primary border border-telegram-primary/30' : 'text-telegram-subtext hover:text-white hover:bg-white/10'}`}
                        title="Toggle Word Wrap"
                    >
                        <WrapText className="w-4 h-4" />
                    </button>

                    {/* Zoom In / Out */}
                    <div className="hidden sm:flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5">
                        <button
                            onClick={() => setFontSize(s => Math.max(10, s - 1))}
                            className="p-1 text-telegram-subtext hover:text-white rounded hover:bg-white/10 transition cursor-pointer"
                            title="Decrease Font Size"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[11px] font-mono text-telegram-subtext px-1 select-none">
                            {fontSize}px
                        </span>
                        <button
                            onClick={() => setFontSize(s => Math.min(24, s + 1))}
                            className="p-1 text-telegram-subtext hover:text-white rounded hover:bg-white/10 transition cursor-pointer"
                            title="Increase Font Size"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Copy Button */}
                    <button
                        onClick={handleCopy}
                        disabled={!content}
                        className="p-1.5 rounded-lg text-telegram-subtext hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-30"
                        title="Copy All Text"
                    >
                        {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                    </button>

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
                    className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-lg border border-white/10"
                    title="Previous item"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            {onNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors items-center justify-center cursor-pointer z-20 shadow-lg border border-white/10"
                    title="Next item"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            {/* Main Content Area */}
            <div 
                className="flex-1 overflow-auto bg-[#0d0d0f] flex justify-center p-2 sm:p-6"
            >
                {loading && (
                    <div className="flex flex-col items-center justify-center gap-3 text-telegram-subtext m-auto" onClick={e => e.stopPropagation()}>
                        <Loader2 className="w-8 h-8 animate-spin text-telegram-primary" />
                        <span className="text-sm font-medium">Downloading text content...</span>
                    </div>
                )}

                {error && (
                    <div className="m-auto text-center max-w-md p-6 bg-red-500/10 border border-red-500/20 rounded-2xl" onClick={e => e.stopPropagation()}>
                        <p className="text-red-400 font-semibold mb-1">Failed to load text file</p>
                        <p className="text-xs text-telegram-subtext">{error}</p>
                    </div>
                )}

                {!loading && !error && content !== null && (
                    <div className="w-full max-w-5xl bg-[#131316] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden font-mono" onClick={e => e.stopPropagation()}>
                        {/* Editor Header Status */}
                        <div className="px-4 py-2 bg-[#1a1a1e] border-b border-white/5 flex items-center justify-between text-xs text-telegram-subtext select-none">
                            <span>{lines.length.toLocaleString()} lines</span>
                            <span>{content.length.toLocaleString()} characters</span>
                        </div>

                        {/* Text Lines Render */}
                        <div className="flex-1 overflow-auto p-4 select-text">
                            <table className="w-full border-collapse" style={{ fontSize: `${fontSize}px`, lineHeight: '1.6' }}>
                                <tbody>
                                    {lines.map((line, idx) => {
                                        const lineNum = idx + 1;
                                        const isMatched = searchQuery.trim() && line.toLowerCase().includes(searchQuery.toLowerCase());

                                        return (
                                            <tr key={idx} className={isMatched ? 'bg-telegram-primary/15' : 'hover:bg-white/[0.02]'}>
                                                <td className="pr-4 py-0.5 text-right text-telegram-subtext/40 select-none align-top w-12 font-mono text-[11px] border-r border-white/5 shrink-0">
                                                    {lineNum}
                                                </td>
                                                <td className={`pl-4 py-0.5 text-slate-200 align-top ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
                                                    {line}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
