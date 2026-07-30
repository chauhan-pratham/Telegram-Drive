import { Upload } from 'lucide-react';

interface EmptyStateProps {
    onUpload?: () => void;
    tab?: string;
}

export function EmptyState({ onUpload, tab = 'my-drive' }: EmptyStateProps) {

    let title = 'My Drive is empty';
    let desc = 'Upload files or create folders to get started.';

    if (tab === 'starred') {
        title = 'No starred files';
        desc = 'Star files or folders to find them quickly later.';
    } else if (tab === 'recent') {
        title = 'No recent files';
        desc = 'Files you open will appear here.';
    } else if (tab === 'shared') {
        title = 'Nothing shared with you';
        desc = 'Files shared with you will appear here.';
    } else if (tab === 'trash') {
        title = 'Trash is empty';
        desc = 'Items you delete will appear here.';
    }

    const showUploadButton = tab === 'my-drive';

    return (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            {/* Modern Google Drive Style Vector SVG Illustration */}
            <svg
                className="w-48 h-48 mb-6 drop-shadow-xl select-none"
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Subtle Ambient Background Glow */}
                    <radialGradient id="emptyGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" className="text-telegram-primary" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" className="text-telegram-primary" />
                    </radialGradient>

                    {/* Folder Back Gradient */}
                    <linearGradient id="folderBackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" className="text-telegram-primary" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" className="text-telegram-primary" />
                    </linearGradient>

                    {/* Folder Front Cover Gradient */}
                    <linearGradient id="folderFrontGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" className="text-telegram-primary" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.2" className="text-telegram-primary" />
                    </linearGradient>

                    {/* Glass Card Gradient */}
                    <linearGradient id="glassDoc" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
                    </linearGradient>
                </defs>

                {/* Background Soft Radial Aura */}
                <circle cx="100" cy="105" r="75" fill="url(#emptyGlow)" />

                {/* Shadow Ellipse under folder */}
                <ellipse cx="100" cy="158" rx="65" ry="8" fill="black" fillOpacity="0.15" />

                {/* Back Folder Body with Tab */}
                <path
                    d="M 42 76 C 42 71.5 45.5 68 50 68 L 84 68 C 87.5 68 90.5 70 92 73 L 98 84 C 99.5 87 102.5 89 106 89 L 150 89 C 154.5 89 158 92.5 158 97 L 158 146 C 158 150.5 154.5 154 150 154 L 50 154 C 45.5 154 42 150.5 42 146 Z"
                    fill="url(#folderBackGrad)"
                    className="stroke-telegram-primary/40"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />

                {/* Floating Paper Document (Behind Front Lid) */}
                <g className="transition-transform duration-500 hover:-translate-y-2">
                    {/* Document 1 - Back PDF/Doc */}
                    <rect
                        x="70"
                        y="52"
                        width="34"
                        height="44"
                        rx="4"
                        fill="url(#glassDoc)"
                        className="stroke-white/30 dark:stroke-white/20 shadow-lg"
                        strokeWidth="1.5"
                        transform="rotate(-8 70 52)"
                    />
                    <line x1="77" y1="62" x2="94" y2="60" className="stroke-telegram-primary/70" strokeWidth="2" strokeLinecap="round" transform="rotate(-8 70 52)" />
                    <line x1="77" y1="68" x2="90" y2="66" className="stroke-telegram-subtext/60" strokeWidth="1.5" strokeLinecap="round" transform="rotate(-8 70 52)" />

                    {/* Document 2 - Front Media File */}
                    <rect
                        x="96"
                        y="48"
                        width="36"
                        height="48"
                        rx="5"
                        className="fill-telegram-surface/90 stroke-telegram-primary/50 shadow-xl"
                        strokeWidth="1.5"
                        transform="rotate(6 96 48)"
                    />
                    <circle cx="114" cy="66" r="7" className="fill-telegram-primary/20 stroke-telegram-primary" strokeWidth="1.5" transform="rotate(6 96 48)" />
                    <line x1="104" y1="80" x2="124" y2="80" className="stroke-telegram-text/40" strokeWidth="2" strokeLinecap="round" transform="rotate(6 96 48)" />
                    <line x1="104" y1="86" x2="118" y2="86" className="stroke-telegram-subtext/40" strokeWidth="1.5" strokeLinecap="round" transform="rotate(6 96 48)" />
                </g>

                {/* Front Folder Lid Cover (Tilted for Depth) */}
                <path
                    d="M 38 98 C 38 93.5 41.5 90 46 90 L 154 90 C 158.5 90 162 93.5 162 98 L 158 146 C 158 151 154 155 149 155 L 51 155 C 46 155 42 151 42 146 Z"
                    fill="url(#folderFrontGrad)"
                    className="stroke-telegram-primary/60 backdrop-blur-xs"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />

                {/* Center Action Emblem */}
                {showUploadButton ? (
                    <g className="transition-all duration-300">
                        <circle
                            cx="100"
                            cy="123"
                            r="18"
                            className="fill-telegram-surface/90 stroke-telegram-primary shadow-lg"
                            strokeWidth="2"
                        />
                        {/* Upload Arrow */}
                        <path
                            d="M 100 131 L 100 115 M 100 115 L 94 121 M 100 115 L 106 121"
                            className="stroke-telegram-primary"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </g>
                ) : (
                    <circle
                        cx="100"
                        cy="123"
                        r="14"
                        className="fill-telegram-surface/60 stroke-telegram-subtext/40"
                        strokeWidth="1.5"
                    />
                )}
            </svg>

            <h3 className="text-xl font-semibold text-telegram-text mb-2">
                {title}
            </h3>
            <p className="text-telegram-subtext text-sm mb-6 max-w-xs leading-relaxed">
                {desc}
            </p>

            {showUploadButton && onUpload && (
                <button
                    onClick={onUpload}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-telegram-primary text-black font-medium rounded-xl hover:bg-telegram-primary/90 transition-all hover:scale-105 shadow-lg shadow-telegram-primary/20"
                >
                    <Upload className="w-5 h-5" />
                    Upload Files
                </button>
            )}

            {showUploadButton && (
                <div className="mt-8 flex flex-col items-center gap-2 max-w-xs">
                    <p className="text-xs text-telegram-subtext/50">
                        Tip: Use <kbd className="px-1.5 py-0.5 bg-telegram-hover rounded text-telegram-subtext">Cmd + F</kbd> to search
                    </p>
                    <p className="text-[10px] text-telegram-primary/70 leading-normal bg-telegram-primary/5 border border-telegram-primary/10 p-2.5 rounded-lg font-medium">
                        💡 Privacy Tip: If you wish to enforce end-to-end client privacy, you can upload password-protected archives (.zip, .7z) or pre-encrypted files.
                    </p>
                </div>
            )}
        </div>
    );
}
