import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ExternalLink, Download, Trash2 } from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
// Use the legacy build — the modern build uses Map.getOrInsertComputed()
// which isn't available in Tauri's WebKit WebView
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TelegramFile } from '../../../types';
import { isAndroidPlatform } from '../../../utils';

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
                await invoke('cmd_open_file_externally', { path });
            } else {
                alert("Failed to locate file path.");
            }
        } catch (err) {
            console.error("Failed to open externally:", err);
            alert("Error: " + String(err));
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
                 (err) => {
                     if (timeoutId) window.clearTimeout(timeoutId);
                     if (cancelled || timedOut) return;
                     console.error("Error loading PDF:", err);
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

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            {/* Top Header Bar — consistent with PreviewModal & MediaPlayer */}
            <div
                className="w-full flex items-center justify-between px-4 py-3 bg-black/90 text-white z-50 border-b border-white/10 shrink-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Left: Back button + Filename */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 text-white cursor-pointer transition active:scale-95 shrink-0"
                        title="Back (Esc)"
                    >
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <h2 className="text-sm sm:text-base font-semibold text-white truncate tracking-tight" title={file.name}>
                        {file.name}
                    </h2>
                </div>

                {/* Right: Zoom controls + Action buttons */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Zoom pill */}
                    <div className="hidden sm:flex items-center gap-1 bg-white/10 p-1 rounded-full border border-white/10 text-xs">
                        <button onClick={handleZoomOut} className="p-1.5 text-white/70 hover:text-white rounded-full transition-colors cursor-pointer" title="Zoom Out (-)">
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleFitWidth} className="text-[11px] text-white/90 hover:text-white font-medium min-w-[2.75rem] text-center cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-white/10" title="Fit to width / Reset zoom">
                            {Math.round(scale * 100)}%
                        </button>
                        <button onClick={handleZoomIn} className="p-1.5 text-white/70 hover:text-white rounded-full transition-colors cursor-pointer" title="Zoom In (+)">
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Action buttons */}
                    {onDownload && (
                        <button
                            onClick={() => onDownload(file)}
                            className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all shrink-0 cursor-pointer"
                            title="Download"
                        >
                            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    )}
                    <button
                        onClick={handleOpenExternally}
                        disabled={openingExternal}
                        className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                        title="Open in System PDF Viewer"
                    >
                        <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    {onDelete && (
                        <button
                            onClick={() => { onDelete(file); onClose(); }}
                            className="p-2 text-red-400 hover:text-red-300 bg-white/10 hover:bg-red-500/20 rounded-full transition-all shrink-0 cursor-pointer"
                            title="Delete File"
                        >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
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
