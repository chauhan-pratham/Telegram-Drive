
interface IconProps {
    className?: string;
}

interface StarredIconProps extends IconProps {
    filled?: boolean;
}

// A sleek isometric wireframe volume cube representing the Cloud Drive
export function MyDriveIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    );
}

// A clean directory folder icon with a connection/share tree inside
export function SharedIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" />
            <circle cx="12" cy="13" r="1.5" fill="currentColor" />
            <circle cx="8" cy="17" r="1" fill="currentColor" />
            <circle cx="16" cy="17" r="1" fill="currentColor" />
            <line x1="12" y1="14.5" x2="9" y2="16.5" />
            <line x1="12" y1="14.5" x2="15" y2="16.5" />
        </svg>
    );
}

// A modern timeline clock with a history arrow loop
export function RecentIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <polyline points="3 3 3 8 8 8" />
            <line x1="12" y1="7" x2="12" y2="12" />
            <line x1="12" y1="12" x2="15.5" y2="14.5" />
        </svg>
    );
}

// A sharp-edged, high-end outline star
export function StarredIcon({ className = "w-5 h-5", filled = false }: StarredIconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill={filled ? "currentColor" : "none"} 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}

// A clean, industrial outline waste bin
export function TrashIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

// A cloud shell outline merged with a storage grid
export function StorageIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M12 10v4" />
            <path d="M12 14v4" />
            <path d="M18 10a5 5 0 0 0-9.5-2H8a5 5 0 0 0 0 10h10a4 4 0 0 0 0-8z" />
        </svg>
    );
}

// A clean heartbeat/activity line representing bandwidth performance
export function BandwidthIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    );
}

// A sleek directory folder icon
export function FolderIcon({ className = "w-5 h-5" }: IconProps) {
    return (
        <svg 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" />
        </svg>
    );
}

