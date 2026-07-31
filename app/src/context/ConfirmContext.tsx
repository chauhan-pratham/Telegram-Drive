import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'info';
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({ title: '', message: '' });
    const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

    const confirm = (opts: ConfirmOptions) => {
        setOptions(opts);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
            setResolveRef(() => resolve);
        });
    };

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        if (resolveRef) resolveRef(true);
    }, [resolveRef]);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        if (resolveRef) resolveRef(false);
    }, [resolveRef]);

    // Handle Escape and Enter key in modal with capture phase
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, handleConfirm, handleCancel]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div 
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
                    onClick={handleCancel}
                >
                    <div 
                        role="dialog"
                        aria-modal="true"
                        className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 w-96 shadow-2xl animate-in zoom-in-95 cursor-default select-none" 
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-white mb-2">{options.title}</h3>
                        <p className="text-telegram-subtext text-sm mb-6 whitespace-pre-line leading-relaxed">{options.message}</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={handleCancel} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/10 text-telegram-subtext hover:text-white transition cursor-pointer">
                                {options.cancelText || 'Cancel'}
                            </button>
                            <button
                                autoFocus
                                onClick={handleConfirm}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer shadow-md ${options.variant === 'danger' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-telegram-primary text-black hover:bg-telegram-primary/90'}`}
                            >
                                {options.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
    return context;
};
