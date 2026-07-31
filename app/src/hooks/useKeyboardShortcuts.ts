import { useEffect, useCallback, useRef } from 'react';

interface UseKeyboardShortcutsProps {
    onSelectAll: () => void;
    onDelete: () => void;
    onEscape: () => void;
    onSearch: () => void;
    onEnter?: () => void;
    onDownload?: () => void;
    onRename?: () => void;
    onStar?: () => void;
    onMove?: () => void;
    onPreview?: () => void;
    onToggleView?: () => void;
    onToggleInfoPanel?: () => void;
    onUploadFile?: () => void;
    onUploadFolder?: () => void;
    onNewFolder?: () => void;
    onShowShortcutsHelp?: () => void;
    enabled?: boolean;
}

export function useKeyboardShortcuts({
    onSelectAll,
    onDelete,
    onEscape,
    onSearch,
    onEnter,
    onDownload,
    onRename,
    onStar,
    onMove,
    onPreview,
    onToggleView,
    onToggleInfoPanel,
    onUploadFile,
    onUploadFolder,
    onNewFolder,
    onShowShortcutsHelp,
    enabled = true
}: UseKeyboardShortcutsProps) {
    // Two-key sequence state: tracks the first key of a chord (e.g. Alt+V)
    const pendingChordRef = useRef<string | null>(null);
    const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearChord = useCallback(() => {
        pendingChordRef.current = null;
        if (chordTimerRef.current) {
            clearTimeout(chordTimerRef.current);
            chordTimerRef.current = null;
        }
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in inputs or when a modal/dialog is open
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        const hasOpenDialog = !!document.querySelector('[role="dialog"]');

        if (isInput || hasOpenDialog) {
            // Only allow Escape in inputs if no modal is open
            if (e.key === 'Escape' && isInput && !hasOpenDialog) {
                (target as HTMLInputElement).blur();
                onEscape();
            }
            return;
        }

        const isMod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();

        // Alt + V - Toggle grid / list view
        if (e.altKey && !isMod && key === 'v') {
            e.preventDefault();
            onToggleView?.();
            return;
        }

        // Alt + I - Toggle details / info panel
        if (e.altKey && !isMod && key === 'i') {
            e.preventDefault();
            onToggleInfoPanel?.();
            return;
        }

        // ── Single-key shortcuts ───────────────────────────────

        // / (slash) - Quick search focus (only without modifiers)
        if (e.key === '/' && !isMod && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            onSearch();
            return;
        }

        // Ctrl/Cmd + / - Show keyboard shortcuts help
        if (isMod && e.key === '/') {
            e.preventDefault();
            onShowShortcutsHelp?.();
            return;
        }

        // Cmd/Ctrl + A - Select All
        if (isMod && key === 'a' && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            onSelectAll();
            return;
        }

        // Cmd/Ctrl + F - Focus Search
        if (isMod && key === 'f') {
            e.preventDefault();
            onSearch();
            return;
        }

        // Ctrl/Cmd + Shift + N - Create new folder
        if (isMod && e.shiftKey && key === 'n') {
            e.preventDefault();
            onNewFolder?.();
            return;
        }

        // Ctrl/Cmd + Shift + U - Upload folder (ZIP)
        if (isMod && e.shiftKey && key === 'u') {
            e.preventDefault();
            onUploadFolder?.();
            return;
        }

        // Ctrl/Cmd + U - Upload file
        if (isMod && !e.shiftKey && key === 'u') {
            e.preventDefault();
            onUploadFile?.();
            return;
        }

        // Alt + S - Star/Unstar selected items
        if (e.altKey && !isMod && key === 's') {
            e.preventDefault();
            onStar?.();
            return;
        }

        // Alt + M - Move selected items to folder
        if (e.altKey && !isMod && key === 'm') {
            e.preventDefault();
            onMove?.();
            return;
        }

        // Alt + P - Preview selected item
        if (e.altKey && !isMod && key === 'p') {
            e.preventDefault();
            onPreview?.();
            return;
        }

        // Delete / Backspace - Delete selected
        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onDelete();
            return;
        }

        // Escape - Clear selection
        if (e.key === 'Escape') {
            e.preventDefault();
            clearChord();
            onEscape();
            return;
        }

        // Enter - Open / Preview
        if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
            return;
        }

        // F2 - Rename selected file
        if (e.key === 'F2') {
            e.preventDefault();
            onRename?.();
            return;
        }

        // Alt + D - Download selected
        if (e.altKey && !isMod && key === 'd') {
            e.preventDefault();
            onDownload?.();
            return;
        }

    }, [enabled, onSelectAll, onDelete, onEscape, onSearch, onEnter, onDownload, onRename,
        onStar, onMove, onPreview, onToggleView, onToggleInfoPanel, onUploadFile, onUploadFolder,
        onNewFolder, onShowShortcutsHelp, clearChord]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            clearChord();
        };
    }, [handleKeyDown, clearChord]);
}
