
import { 
    HardDrive, 
    Users, 
    Clock, 
    Star, 
    CloudDownload, 
    Trash2, 
    Cloud, 
    Activity, 
    Folder 
} from 'lucide-react';

interface IconProps {
    className?: string;
}

interface StarredIconProps extends IconProps {
    filled?: boolean;
}

// My Drive: Modern sleek HardDrive icon
export function MyDriveIcon({ className = "w-5 h-5" }: IconProps) {
    return <HardDrive className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Shared with me: Clean multi-user icon
export function SharedIcon({ className = "w-5 h-5" }: IconProps) {
    return <Users className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Recent: History clock icon
export function RecentIcon({ className = "w-5 h-5" }: IconProps) {
    return <Clock className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Starred: Clean star icon
export function StarredIcon({ className = "w-5 h-5", filled = false }: StarredIconProps) {
    return (
        <Star 
            className={`${className} shrink-0 pointer-events-none select-none`} 
            strokeWidth={1.75} 
            fill={filled ? "currentColor" : "none"} 
        />
    );
}

// Offline: Cloud download / offline availability icon
export function OfflineIcon({ className = "w-5 h-5" }: IconProps) {
    return <CloudDownload className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Trash: Modern trash bin icon
export function TrashIcon({ className = "w-5 h-5" }: IconProps) {
    return <Trash2 className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Storage: Clean cloud storage icon
export function StorageIcon({ className = "w-5 h-5" }: IconProps) {
    return <Cloud className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Bandwidth: Activity / performance trend line icon
export function BandwidthIcon({ className = "w-5 h-5" }: IconProps) {
    return <Activity className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}

// Folder: Directory folder icon
export function FolderIcon({ className = "w-5 h-5" }: IconProps) {
    return <Folder className={`${className} shrink-0 pointer-events-none select-none`} strokeWidth={1.75} />;
}



