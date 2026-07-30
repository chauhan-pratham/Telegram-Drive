import { Search, Settings, Sun, Moon, SlidersHorizontal, LogOut, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileTypeFilter } from '../../../context/DriveContext';

interface GlobalHeaderProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    fileTypeFilter: FileTypeFilter;
    setFileTypeFilter: (filter: FileTypeFilter) => void;
    onSettingsClick: () => void;
    theme: string;
    toggleTheme: () => void;
    isConnected: boolean;
    onLogout: () => void;
    isSearching?: boolean;
}

export function GlobalHeader({
    searchTerm,
    onSearchChange,
    fileTypeFilter,
    setFileTypeFilter,
    onSettingsClick,
    theme,
    toggleTheme,
    isConnected,
    onLogout,
    isSearching = false,
}: GlobalHeaderProps) {
    const [showFilters, setShowFilters] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    const [user, setUser] = useState<{ first_name: string; last_name?: string; username?: string; photo_base64?: string } | null>(null);

    useEffect(() => {
        if (isConnected) {
            invoke<{ first_name: string; last_name?: string; username?: string; photo_base64?: string } | null>('cmd_get_me')
                .then((userData) => {
                    if (userData) {
                        setUser(userData);
                    }
                })
                .catch((err) => {
                    console.error("Failed to fetch user details:", err);
                });
        } else {
            setUser(null);
        }
    }, [isConnected]);

    useEffect(() => {
        if (!showFilters) return;
        const handler = (e: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
                setShowFilters(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showFilters]);

    useEffect(() => {
        if (!showProfileMenu) return;
        const handler = (e: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
                setShowProfileMenu(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showProfileMenu]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowFilters(false);
                setShowProfileMenu(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleFilterSelect = (filter: FileTypeFilter) => {
        setFileTypeFilter(filter);
        setShowFilters(false);
    };

    const getFilterLabel = (filter: FileTypeFilter) => {
        switch (filter) {
            case 'pdf': return 'PDFs';
            case 'image': return 'Images';
            case 'video': return 'Videos';
            case 'audio': return 'Audio';
            case 'archive': return 'Archives';
            case 'document': return 'Documents';
            default: return 'All files';
        }
    };

    return (
        <header className="h-16 flex items-center justify-between px-6 bg-transparent select-none z-30">
            {/* Brand Logo & Title */}
            <div className="flex items-center gap-3 w-60">
                <img src="/logo.svg?v=2" className="w-9 h-9 drop-shadow-md" alt="Logo" />
                <span className="font-semibold text-lg text-telegram-text tracking-tight">Drive</span>
            </div>

            {/* Google Drive styled Search Bar */}
            <div className="flex-1 max-w-2xl mx-8 relative" ref={filterMenuRef}>
                <div className="flex items-center w-full bg-telegram-surface/60 border border-telegram-border/50 rounded-full px-5 py-2.5 shadow-sm focus-within:bg-telegram-surface focus-within:shadow-md focus-within:border-telegram-primary/20 transition-all gap-3">
                    {isSearching ? (
                        <Loader2 className="w-5 h-5 text-telegram-primary flex-shrink-0 animate-spin" />
                    ) : (
                        <Search className="w-5 h-5 text-telegram-subtext flex-shrink-0" />
                    )}
                    <input
                        type="text"
                        data-search-input
                        placeholder={`Search files... (${getFilterLabel(fileTypeFilter)})`}
                        className="w-full bg-transparent text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowFilters(!showFilters);
                        }}
                        className={`p-1.5 hover:bg-telegram-hover rounded-full transition-colors flex-shrink-0 ${fileTypeFilter !== 'all' ? 'text-telegram-primary' : 'text-telegram-subtext'}`}
                        title="Search options"
                    >
                        <SlidersHorizontal className="w-4.5 h-4.5" />
                    </button>
                </div>

                {/* Filters Dropdown Popover */}
                {showFilters && (
                    <div className="absolute top-13 right-0 w-48 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="px-2 py-1 text-[10px] font-bold text-telegram-subtext uppercase tracking-wider border-b border-telegram-border/50 mb-1">
                            Filter by type
                        </div>
                        {(['all', 'pdf', 'image', 'video', 'audio', 'archive', 'document'] as FileTypeFilter[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => handleFilterSelect(f)}
                                className={`px-2 py-1.5 text-xs text-left rounded-md transition-colors ${
                                    fileTypeFilter === f
                                        ? 'bg-telegram-primary/10 text-telegram-primary font-semibold'
                                        : 'text-telegram-text hover:bg-telegram-hover'
                                }`}
                            >
                                {getFilterLabel(f)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Settings & Profile on Right */}
            <div className="flex items-center gap-2 relative" ref={profileMenuRef}>
                <button
                    onClick={toggleTheme}
                    className="p-2 hover:bg-telegram-hover rounded-full text-telegram-subtext hover:text-telegram-text transition-colors relative group"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {/* Profile Avatar Icon with click popover */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowProfileMenu(!showProfileMenu);
                    }}
                    className="w-8.5 h-8.5 rounded-full bg-telegram-primary/20 text-telegram-primary font-bold text-xs flex items-center justify-center border border-telegram-primary/30 ml-1 select-none cursor-pointer hover:bg-telegram-primary/30 transition-colors overflow-hidden"
                    title="Account & Settings"
                >
                    {user?.photo_base64 ? (
                        <img 
                            src={user.photo_base64} 
                            alt="Profile" 
                            className="w-full h-full object-cover" 
                        />
                    ) : (
                        user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'
                    )}
                </div>

                {/* Profile menu Popover */}
                {showProfileMenu && (
                    <div className="absolute top-11 right-0 w-64 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl p-2.5 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
                        {/* Account status info */}
                        <div className="px-3 py-2 flex items-center gap-3 border-b border-telegram-border/50 pb-2.5">
                            <div className="w-9 h-9 rounded-full bg-telegram-primary/20 text-telegram-primary font-bold text-sm flex items-center justify-center border border-telegram-primary/30 shrink-0 overflow-hidden">
                                {user?.photo_base64 ? (
                                    <img src={user.photo_base64} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U'
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-sm text-telegram-text truncate">
                                    {user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Telegram Drive User'}
                                </span>
                                {user?.username && (
                                    <span className="text-xs text-telegram-subtext font-mono truncate">@{user.username}</span>
                                )}
                            </div>
                        </div>

                        {/* Actions list */}
                        <div className="flex flex-col gap-0.5 pt-1">
                            <button
                                onClick={() => {
                                    setShowProfileMenu(false);
                                    onSettingsClick();
                                }}
                                className="flex items-center gap-2.5 px-3 py-2 text-sm text-telegram-text hover:bg-telegram-hover rounded-lg text-left transition-colors w-full cursor-pointer font-medium"
                            >
                                <Settings className="w-4 h-4 text-telegram-primary" />
                                <span>Settings</span>
                            </button>

                            <button
                                onClick={() => {
                                    onLogout();
                                    setShowProfileMenu(false);
                                }}
                                className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg text-left transition-colors w-full cursor-pointer"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
}
