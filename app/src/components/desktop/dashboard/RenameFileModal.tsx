import { useState, useRef, useEffect, useMemo } from 'react';
import { Pencil, X } from 'lucide-react';

interface RenameFileModalProps {
    fileName: string;
    onRename: (newName: string) => Promise<void>;
    onClose: () => void;
}

export function RenameFileModal({ fileName, onRename, onClose }: RenameFileModalProps) {
    const { basename, extension } = useMemo(() => {
        const lastDotIndex = fileName.lastIndexOf('.');
        if (lastDotIndex > 0) {
            return {
                basename: fileName.substring(0, lastDotIndex),
                extension: fileName.substring(lastDotIndex)
            };
        }
        return { basename: fileName, extension: '' };
    }, [fileName]);

    const [name, setName] = useState(basename);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [fileName]);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        const trimmed = name.trim();
        const finalName = trimmed + extension;
        if (!trimmed || finalName === fileName) {
            onClose();
            return;
        }
        setIsSubmitting(true);
        try {
            await onRename(finalName);
            onClose();
        } catch {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="bg-telegram-surface border border-telegram-border rounded-xl w-full max-w-[380px] max-w-[90vw] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <h3 className="text-telegram-text font-medium flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-blue-400" />
                        Rename File
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-telegram-subtext hover:text-telegram-text transition-colors"
                        disabled={isSubmitting}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    <label className="text-xs text-telegram-subtext font-medium block">
                        File Name {extension && (<span>(extension <span className="text-telegram-text font-mono font-bold">{extension}</span> is locked)</span>)}
                    </label>
                    <div className="flex items-center w-full bg-telegram-bg border border-telegram-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-telegram-primary/50 focus-within:border-telegram-primary/50 transition-all">
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            maxLength={200}
                            className="flex-1 bg-transparent px-3 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext/50 focus:outline-none"
                            placeholder="File name"
                            disabled={isSubmitting}
                        />
                        {extension && (
                            <span className="px-3 py-2 bg-white/5 border-l border-telegram-border/50 text-xs font-mono font-semibold text-telegram-subtext select-none shrink-0">
                                {extension}
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-telegram-border flex justify-end gap-2 bg-telegram-hover/10">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-telegram-subtext hover:text-telegram-text bg-telegram-hover/50 hover:bg-telegram-hover rounded-lg transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name.trim()}
                        className="px-4 py-2 text-sm font-medium bg-telegram-primary text-black hover:bg-telegram-primary/90 rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
