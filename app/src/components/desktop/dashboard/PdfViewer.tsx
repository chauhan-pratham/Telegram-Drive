import { useEffect, useState, useRef } from 'react';
import { FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ExternalLink, Download, Trash2, ShieldAlert, X } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
// Use the legacy build — the modern build uses Map.getOrInsertComputed()
// which isn't available in Tauri's WebKit WebView
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TelegramFile } from '../../../types';
import { isAndroidPlatform, formatBytes } from '../../../utils';

// Use Vite's ?url suffix to get a properly bundled asset URL for the worker
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface StreamInfo {
    token: string;
    base_url: string;
}

interface PdfViewerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
    onDownload?: (file: TelegramFile) => void;
    onShare?: (file: TelegramFile) => void;
    onDelete?: (file: TelegramFile) => void;
}

export function PdfViewer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId, onDownload, onShare: _onShare, onDelete }: PdfViewerProps) {
    const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState<number>(() => {
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1024;
        if (screenW < 640) {
            return Math.max(0.45, Math.min(0.85, (screenW - 24) / 612));
        }
        return 1.2;
    });
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [openingExternal, setOpeningExternal] = useState<boolean>(false);
    const [securityBlocked, setSecurityBlocked] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

    const handleOpenExternally = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setOpeningExternal(true);
        try {
            const path = await invoke<string>('cmd_get_preview', {
                messageId: file.id,
                folderId: activeFolderId
            });
            if (path) {
                const sec = await invoke<{ is_executable: boolean; detected_type: string }>('cmd_check_file_security', {
                    path,
                    mime: file.mime_type
                });

                if (sec.is_executable) {
                    setSecurityBlocked(true);
                    return;
                }

                await invoke('cmd_open_file_externally', { path });
            } else {
                alert("Failed to locate file path.");
            }
        } catch (err: any) {
            console.error("Failed to open externally:", err);
            const msg = typeof err === 'string' ? err : err?.message || "Failed to open file.";
            if (msg.toLowerCase().includes("security") || msg.toLowerCase().includes("executable")) {
                setSecurityBlocked(true);
            } else {
                alert("Error: " + msg);
            }
        } finally {
            setOpeningExternal(false);
        }
    };

    // Fetch stream info once
    useEffect(() => {
        if (isAndroidPlatform) return; // skip on Android
        invoke<StreamInfo>('cmd_get_stream_info').then(setStreamInfo).catch((err) => {
            console.error("Failed to get stream info:", err);
            setError("Failed to initialize stream");
        });
    }, []);

    // Load PDF document when stream URL is ready or file changes
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setPdf(null);
        setNumPages(0);

        if (isAndroidPlatform) {
            let activeLoadingTask: any = null;
            // Android: load via converted cache file URL
            invoke<string>('cmd_get_preview', {
                messageId: file.id,
                folderId: activeFolderId
            }).then((filePath) => {
                if (cancelled) return;
                if (filePath) {
                    const url = convertFileSrc(filePath);
                    const loadingTask = pdfjsLib.getDocument({
                        url: url,
                        disableRange: true,
                        disableStream: true,
                        disableAutoFetch: true,
                    });
                    activeLoadingTask = loadingTask;
                    loadingTask.promise.then(
                        (pdfDoc) => {
                            if (cancelled) {
                                pdfDoc.destroy();
                                return;
                            }
                            if (pdfRef.current) {
                                pdfRef.current.destroy();
                            }
                            pdfRef.current = pdfDoc;
                            setPdf(pdfDoc);
                            setNumPages(pdfDoc.numPages);
                            setLoading(false);
                        },
                        (err) => {
                            if (cancelled) return;
                            console.error("Error loading PDF via cache URL, falling back to external opener:", err);
                            invoke('cmd_open_file_externally', { path: filePath })
                                .then(() => {
                                    if (!cancelled) onClose();
                                })
                                .catch((exErr) => {
                                    if (!cancelled) {
                                        setError("Failed to render PDF in WebView or open natively: " + String(exErr));
                                        setLoading(false);
                                    }
                                });
                        }
                    );
                } else {
                    setError("Failed to fetch PDF preview path.");
                    setLoading(false);
                }
            }).catch((err) => {
                if (cancelled) return;
                console.error("Error invoking PDF preview command:", err);
                setError("Failed to load PDF.");
                setLoading(false);
            });

            return () => {
                cancelled = true;
                if (activeLoadingTask) {
                    activeLoadingTask.destroy();
                }
                if (pdfRef.current) {
                    pdfRef.current.destroy();
                }
            };
        }

        // Desktop & Mobile: check local offline storage first
        let activeTask: any = null;
        let timedOut = false;
        let timeoutId: number | null = null;

        const loadFromStream = () => {
            if (cancelled || !streamInfo) return;
            const folderIdParam = activeFolderId !== null ? activeFolderId.toString() : 'home';
            const streamUrl = `${streamInfo.base_url}/stream/${folderIdParam}/${file.id}?token=${streamInfo.token}`;

            const loadingTask = pdfjsLib.getDocument(streamUrl);
            activeTask = loadingTask;
            timeoutId = window.setTimeout(() => {
                timedOut = true;
                loadingTask.destroy();
                setError('The preview is taking too long. Open the document in your system PDF viewer instead.');
                setLoading(false);
            }, 15_000);

            loadingTask.promise.then(
                 (pdfDoc) => {
                     if (timeoutId) window.clearTimeout(timeoutId);
                     if (cancelled) {
                         pdfDoc.destroy();
                         return;
                     }
                     if (pdfRef.current) {
                         pdfRef.current.destroy();
                     }
                     pdfRef.current = pdfDoc;
                     setPdf(pdfDoc);
                     setNumPages(pdfDoc.numPages);
                     setLoading(false);
                 },
                 async (err) => {
                     if (timeoutId) window.clearTimeout(timeoutId);
                     if (cancelled || timedOut) return;
                     console.error("Error loading PDF:", err);
                     try {
                         const path = await invoke<string>('cmd_get_preview', {
                             messageId: file.id,
                             folderId: activeFolderId
                         });
                         if (path) {
                             const sec = await invoke<{ is_executable: boolean; detected_type: string }>('cmd_check_file_security', {
                                 path,
                                 mime: file.mime_type
                             });
                             if (sec.is_executable) {
                                 setSecurityBlocked(true);
                                 setLoading(false);
                                 return;
                             }
                         }
                     } catch {
                         // Ignore
                     }
                     setError("Failed to load PDF preview");
                     setLoading(false);
                 }
            );
        };

        invoke<string | null>('cmd_check_offline_file', {
            fileId: file.id,
            fileName: file.name
        }).then(offlinePath => {
            if (cancelled) return;
            if (offlinePath) {
                const url = convertFileSrc(offlinePath);
                const task = pdfjsLib.getDocument({ url });
                activeTask = task;
                task.promise.then(pdfDoc => {
                    if (cancelled) { pdfDoc.destroy(); return; }
                    if (pdfRef.current) pdfRef.current.destroy();
                    pdfRef.current = pdfDoc;
                    setPdf(pdfDoc);
                    setNumPages(pdfDoc.numPages);
                    setLoading(false);
                }).catch(err => {
                    console.error("Offline PDF load error, falling back to stream:", err);
                    loadFromStream();
                });
            } else {
                loadFromStream();
            }
        }).catch(() => {
            if (!cancelled) loadFromStream();
        });

        return () => {
            cancelled = true;
            if (timeoutId) window.clearTimeout(timeoutId);
            if (activeTask) activeTask.destroy();
            if (pdfRef.current) {
                pdfRef.current.destroy();
            }
        };
    }, [file.id, streamInfo, activeFolderId]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing inside input / textarea
            if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
                return;
            }

            // Ctrl/Cmd +/- belongs to the application-wide WebView zoom handler.
            // Plain +/- remains reserved for document zoom.
            if (e.ctrlKey || e.metaKey) {
                return;
            }

            const key = e.key.toLowerCase();

            if (e.key === 'ArrowRight' || key === 'l') {
                e.preventDefault();
                onNext?.();
                return;
            }

            if (e.key === 'ArrowLeft' || key === 'j') {
                e.preventDefault();
                onPrev?.();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }

            if (e.key === '=' || key === '+') {
                e.preventDefault();
                setScale(s => Math.min(s + 0.2, 3));
            }

            if (e.key === '-') {
                e.preventDefault();
                setScale(s => Math.max(s - 0.2, 0.4));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    const handleZoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(s => Math.min(s + 0.2, 3));
    };

    const handleZoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(s => Math.max(s - 0.2, 0.4));
    };

    const handleFitWidth = (e: React.MouseEvent) => {
        e.stopPropagation();
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1024;
        if (screenW < 640) {
            setScale(Math.max(0.45, Math.min(0.85, (screenW - 24) / 612)));
        } else {
            setScale(1.2);
        }
    };

    if (securityBlocked) {
        return (
            <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200" onClick={onClose}>
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
                                This file contains executable binary code (<code className="font-mono bg-red-950/80 px-1 py-0.5 rounded">MZ</code> header) disguised as a PDF document. Direct launching is blocked for your protection.
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
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            {/* Top Toolbar — unified across all file viewers */}
            <div
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#161619] border-b border-white/10 shrink-0 shadow-lg text-white z-50"
                onClick={e => e.stopPropagation()}
            >
                {/* Left File Title & Icon */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                        title="Close preview (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-5 h-5 text-red-400 shrink-0" />
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

                {/* Right Tools & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Zoom controls */}
                    <div className="hidden sm:flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10 text-xs">
                        <button onClick={handleZoomOut} className="p-1 text-telegram-subtext hover:text-white rounded transition-colors cursor-pointer" title="Zoom Out (-)">
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleFitWidth} className="text-xs text-white/90 hover:text-white font-mono font-medium min-w-[2.5rem] text-center cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-white/10" title="Fit to width / Reset zoom">
                            {Math.round(scale * 100)}%
                        </button>
                        <button onClick={handleZoomIn} className="p-1 text-telegram-subtext hover:text-white rounded transition-colors cursor-pointer" title="Zoom In (+)">
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <button
                        onClick={handleOpenExternally}
                        disabled={openingExternal}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition disabled:opacity-50 cursor-pointer"
                        title="Open in System PDF Viewer"
                    >
                        <ExternalLink className="w-5 h-5" />
                    </button>

                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer"
                            title="Download File"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                    )}

                    {onDelete && (
                        <button
                            onClick={() => { onDelete(file); onClose(); }}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                            title="Delete File"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Buttons (desktop view only) */}
            {onPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev(); }}
                    className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all z-10 border border-white/10 cursor-pointer"
                    title="Previous file (ArrowLeft / J)"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}

            {onNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext(); }}
                    className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white bg-black/40 backdrop-blur-md hover:bg-black/60 rounded-full transition-all z-10 border border-white/10 cursor-pointer"
                    title="Next file (ArrowRight / L)"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            )}

            {/* Scrollable Document Container */}
            <div
                ref={containerRef}
                className="flex-1 w-full overflow-auto custom-scrollbar flex flex-col items-center pt-4 pb-20 px-1 sm:px-4 relative"
                onClick={onClose}
            >
                {loading && (
                    <div className="flex flex-col items-center justify-center flex-1 text-white absolute inset-0">
                        <div className="w-10 h-10 border-4 border-telegram-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p>Loading document...</p>
                        <p className="text-xs text-white/50 mt-1">Downloading from Telegram...</p>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center text-white bg-red-500/20 p-6 rounded-xl border border-red-500/50 mt-20 max-w-md text-center">
                        <p className="font-bold mb-2">Error</p>
                        <p className="text-sm mb-6">{error}</p>
                        <button
                            onClick={handleOpenExternally}
                            disabled={openingExternal}
                            className="px-5 py-2.5 bg-telegram-primary text-black font-semibold rounded-xl active:scale-95 transition-all duration-200 shadow-lg text-sm disabled:opacity-50 pointer-events-auto cursor-pointer"
                        >
                            {openingExternal ? 'Opening...' : 'Open with External App'}
                        </button>
                    </div>
                )}

                {pdf && numPages > 0 && (
                    <div className="flex flex-col gap-4 w-full items-center">
                        {Array.from({ length: numPages }, (_, index) => (
                            <PdfPage
                                key={`${file.id}_page_${index + 1}`}
                                pageNumber={index + 1}
                                pdf={pdf}
                                scale={scale}
                            />
                        ))}
                    </div>
                )}
            </div>
            {/* Footer Navigation Info */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs sm:text-sm bg-black/40 backdrop-blur-md px-3 sm:px-4 py-1 sm:py-1.5 rounded-full pointer-events-none border border-white/10">
                {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                    <span className="mr-2 sm:mr-3 border-r border-white/20 pr-2 sm:pr-3">File {currentIndex + 1} of {totalItems}</span>
                )}
                <span>{numPages} {numPages === 1 ? 'page' : 'pages'}</span>
            </div>
        </div>
    );
}

// Individual Page Component — lazy-loaded via IntersectionObserver with strict dimension locking
function PdfPage({ pageNumber, pdf, scale }: { pageNumber: number; pdf: pdfjsLib.PDFDocumentProxy; scale: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [isVisible, setIsVisible] = useState(false);
    const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null);
    const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
    const renderedScaleRef = useRef<number | null>(null);

    // Intersection Observer — pre-trigger render when within 1500px of viewport
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            (entries) => {
                setIsVisible(entries[0].isIntersecting);
            },
            { rootMargin: '1500px 0px' }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Fetch PDF page object once when component enters observer range
    useEffect(() => {
        if (!pdf || page) return;
        if (!isVisible) return;

        let cancelled = false;
        pdf.getPage(pageNumber).then(loadedPage => {
            if (!cancelled) {
                setPage(loadedPage);
                // Store base unscaled viewport dimensions so container height never collapses
                const baseViewport = loadedPage.getViewport({ scale: 1 });
                setPageDimensions({ width: baseViewport.width, height: baseViewport.height });
            }
        }).catch(err => console.error("Error loading page", pageNumber, err));

        return () => {
            cancelled = true;
        };
    }, [pdf, pageNumber, isVisible, page]);

    // Reset rendered scale lock when global scale changes
    useEffect(() => {
        renderedScaleRef.current = null;
    }, [scale]);

    // Render page to canvas
    useEffect(() => {
        if (!page || !canvasRef.current || !isVisible) return;

        // Skip re-rendering if canvas is already painted at current scale
        if (renderedScaleRef.current === scale) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        // Cancel any in-flight render task before starting a new one
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        // Set canvas resolution to exact viewport dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render page content
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        renderTask.promise.then(() => {
            renderTaskRef.current = null;
            renderedScaleRef.current = scale;
        }).catch((err) => {
            // Ignore cancelled render tasks
            if (err?.name !== 'RenderingCancelledException') {
                console.error('[PdfViewer] Page rendering error for page', pageNumber, err);
            }
        });

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
                renderTaskRef.current = null;
            }
        };
    }, [page, scale, isVisible, pageNumber]);

    // Compute exact pixel dimensions for container wrapper
    const currentWidth = pageDimensions ? pageDimensions.width * scale : null;
    const currentHeight = pageDimensions ? pageDimensions.height * scale : null;

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center justify-center relative bg-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl border border-white/10 max-w-full"
            onClick={e => e.stopPropagation()}
            style={{
                width: currentWidth ? `${currentWidth}px` : '100%',
                height: currentHeight ? `${currentHeight}px` : '600px',
                maxWidth: '100%',
            }}
        >
            <canvas ref={canvasRef} className="block rounded-xl max-w-full h-auto" />
            
            {/* Show page number badge */}
            <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white/70 font-mono pointer-events-none">
                Page {pageNumber}
            </div>
        </div>
    );
}
