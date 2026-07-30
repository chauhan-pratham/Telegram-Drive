import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ShortcutEntry {
    keys: string[];
    description: string;
}

interface ShortcutGroup {
    title: string;
    shortcuts: ShortcutEntry[];
}

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';

const shortcutGroups: ShortcutGroup[] = [
    {
        title: 'Selection & Navigation',
        shortcuts: [
            { keys: [`${mod}`, 'A'], description: 'Select all items' },
            { keys: ['Esc'], description: 'Clear selection' },
            { keys: ['Enter'], description: 'Open selected item' },
            { keys: ['/'], description: 'Focus search' },
            { keys: [`${mod}`, 'F'], description: 'Find / Search' },
        ],
    },
    {
        title: 'File Actions',
        shortcuts: [
            { keys: ['F2'], description: 'Rename selected item' },
            { keys: ['Delete'], description: 'Delete selected items' },
            { keys: [`${alt}`, 'D'], description: 'Download selected items' },
            { keys: [`${alt}`, 'S'], description: 'Star / Unstar selected items' },
            { keys: [`${alt}`, 'M'], description: 'Move selected items to folder' },
            { keys: [`${alt}`, 'P'], description: 'Preview selected item' },
        ],
    },
    {
        title: 'Create & Upload',
        shortcuts: [
            { keys: [`${mod}`, 'Shift', 'N'], description: 'Create new folder' },
            { keys: [`${mod}`, 'U'], description: 'Upload file' },
            { keys: [`${mod}`, 'Shift', 'U'], description: 'Upload folder (ZIP)' },
        ],
    },
    {
        title: 'View',
        shortcuts: [
            { keys: [`${alt}`, 'V'], description: 'Toggle grid / list view' },
            { keys: [`${alt}`, 'I'], description: 'Toggle details panel' },
        ],
    },
    {
        title: 'Application',
        shortcuts: [
            { keys: [`${mod}`, '/'], description: 'Show this shortcuts list' },
        ],
    },
];

function KeyBadge({ label }: { label: string }) {
    const isArrow = label === '→';
    if (isArrow) {
        return <span className="text-telegram-subtext/60 text-xs font-normal mx-0.5">then</span>;
    }
    return (
        <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-telegram-bg border border-telegram-border/60 text-telegram-text text-[11px] font-mono font-medium shadow-[0_1px_0_0_rgba(0,0,0,0.15)]">
            {label}
        </kbd>
    );
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-telegram-surface border border-telegram-border rounded-xl w-full max-w-[520px] max-h-[80vh] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-telegram-border flex items-center justify-between flex-shrink-0">
                    <h3 className="text-telegram-text font-medium flex items-center gap-2">
                        <Keyboard className="w-4 h-4 text-telegram-primary" />
                        Keyboard Shortcuts
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-telegram-subtext hover:text-telegram-text transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto custom-scrollbar p-4 space-y-5">
                    {shortcutGroups.map((group) => (
                        <div key={group.title}>
                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-telegram-primary/80 mb-2.5">
                                {group.title}
                            </h4>
                            <div className="space-y-0">
                                {group.shortcuts.map((shortcut, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-telegram-hover/40 transition-colors"
                                    >
                                        <span className="text-sm text-telegram-text/85">
                                            {shortcut.description}
                                        </span>
                                        <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                                            {shortcut.keys.map((k, i) => (
                                                <span key={i} className="flex items-center gap-0.5">
                                                    {i > 0 && k !== '→' && shortcut.keys[i - 1] !== '→' && (
                                                        <span className="text-telegram-subtext/40 text-[10px] mx-0.5">+</span>
                                                    )}
                                                    <KeyBadge label={k} />
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-telegram-border flex justify-center bg-telegram-hover/10 flex-shrink-0">
                    <span className="text-[11px] text-telegram-subtext/60">
                        Press <kbd className="px-1 py-0.5 rounded bg-telegram-bg border border-telegram-border/60 text-[10px] font-mono mx-0.5">Esc</kbd> to close
                    </span>
                </div>
            </div>
        </div>
    );
}
