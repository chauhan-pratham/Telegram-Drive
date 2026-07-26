import {
    File, FileText, FileImage, FileVideo, FileAudio,
    FileArchive, FileCode, FileSpreadsheet, Presentation,
    FileType
} from 'lucide-react';
import { useMemo } from 'react';

interface FileTypeConfig {
    icon: typeof File;
    gradient: { start: string; end: string };
    label: string;
}

const gradients = {
    pdf: { start: '#EF5350', end: '#C62828' },
    image: { start: '#EC407A', end: '#D81B60' },
    video: { start: '#AB47BC', end: '#6A1B9A' },
    audio: { start: '#26A69A', end: '#00695C' },
    spreadsheet: { start: '#66BB6A', end: '#2E7D32' },
    presentation: { start: '#FFA726', end: '#EF6C00' },
    archive: { start: '#FFCA28', end: '#FF8F00' },
    code: { start: '#42A5F5', end: '#1565C0' },
    text: { start: '#90A4AE', end: '#455A64' },
};

const extensionMap: Record<string, FileTypeConfig> = {
    // Images
    jpg: { icon: FileImage, gradient: gradients.image, label: 'JPG' },
    jpeg: { icon: FileImage, gradient: gradients.image, label: 'JPEG' },
    png: { icon: FileImage, gradient: gradients.image, label: 'PNG' },
    gif: { icon: FileImage, gradient: gradients.image, label: 'GIF' },
    webp: { icon: FileImage, gradient: gradients.image, label: 'WEBP' },
    svg: { icon: FileImage, gradient: gradients.image, label: 'SVG' },
    bmp: { icon: FileImage, gradient: gradients.image, label: 'BMP' },
    heic: { icon: FileImage, gradient: gradients.image, label: 'HEIC' },

    // Videos
    mp4: { icon: FileVideo, gradient: gradients.video, label: 'MP4' },
    mov: { icon: FileVideo, gradient: gradients.video, label: 'MOV' },
    avi: { icon: FileVideo, gradient: gradients.video, label: 'AVI' },
    mkv: { icon: FileVideo, gradient: gradients.video, label: 'MKV' },
    webm: { icon: FileVideo, gradient: gradients.video, label: 'WEBM' },

    // Audio
    mp3: { icon: FileAudio, gradient: gradients.audio, label: 'MP3' },
    wav: { icon: FileAudio, gradient: gradients.audio, label: 'WAV' },
    flac: { icon: FileAudio, gradient: gradients.audio, label: 'FLAC' },
    aac: { icon: FileAudio, gradient: gradients.audio, label: 'AAC' },
    ogg: { icon: FileAudio, gradient: gradients.audio, label: 'OGG' },

    // Documents
    pdf: { icon: FileType, gradient: gradients.pdf, label: 'PDF' },
    doc: { icon: FileText, gradient: gradients.code, label: 'DOC' },
    docx: { icon: FileText, gradient: gradients.code, label: 'DOCX' },
    txt: { icon: FileText, gradient: gradients.text, label: 'TXT' },
    rtf: { icon: FileText, gradient: gradients.text, label: 'RTF' },
    md: { icon: FileText, gradient: gradients.text, label: 'MD' },

    // Spreadsheets
    xls: { icon: FileSpreadsheet, gradient: gradients.spreadsheet, label: 'XLS' },
    xlsx: { icon: FileSpreadsheet, gradient: gradients.spreadsheet, label: 'XLSX' },
    csv: { icon: FileSpreadsheet, gradient: gradients.spreadsheet, label: 'CSV' },

    // Presentations
    ppt: { icon: Presentation, gradient: gradients.presentation, label: 'PPT' },
    pptx: { icon: Presentation, gradient: gradients.presentation, label: 'PPTX' },
    key: { icon: Presentation, gradient: gradients.presentation, label: 'KEY' },

    // Archives
    zip: { icon: FileArchive, gradient: gradients.archive, label: 'ZIP' },
    rar: { icon: FileArchive, gradient: gradients.archive, label: 'RAR' },
    '7z': { icon: FileArchive, gradient: gradients.archive, label: '7Z' },
    tar: { icon: FileArchive, gradient: gradients.archive, label: 'TAR' },
    gz: { icon: FileArchive, gradient: gradients.archive, label: 'GZ' },

    // Code
    js: { icon: FileCode, gradient: gradients.code, label: 'JS' },
    ts: { icon: FileCode, gradient: gradients.code, label: 'TS' },
    jsx: { icon: FileCode, gradient: gradients.code, label: 'JSX' },
    tsx: { icon: FileCode, gradient: gradients.code, label: 'TSX' },
    py: { icon: FileCode, gradient: gradients.code, label: 'PY' },
    rs: { icon: FileCode, gradient: gradients.code, label: 'RS' },
    go: { icon: FileCode, gradient: gradients.code, label: 'GO' },
    java: { icon: FileCode, gradient: gradients.code, label: 'JAVA' },
    html: { icon: FileCode, gradient: gradients.code, label: 'HTML' },
    css: { icon: FileCode, gradient: gradients.code, label: 'CSS' },
    json: { icon: FileCode, gradient: gradients.code, label: 'JSON' },
};

export function getFileTypeInfo(filename?: string): FileTypeConfig {
    const safeName = filename || '';
    const ext = safeName.split('.').pop()?.toLowerCase() || '';
    return extensionMap[ext] || { icon: File, gradient: gradients.text, label: ext.toUpperCase().slice(0, 4) };
}

interface FileTypeIconProps {
    filename: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
    sm: 'w-5 h-5',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
};

export function FileTypeIcon({ filename, className, size = 'md' }: FileTypeIconProps) {
    const { icon: Icon, gradient, label } = getFileTypeInfo(filename);
    const sizeClass = className ?? sizeMap[size];

    // Generate a unique ID suffix to avoid duplicate linearGradient definitions in SVG DOM
    const gradIdSuffix = useMemo(() => Math.random().toString(36).substring(2, 9), []);

    return (
        <div className={`relative flex items-center justify-center ${sizeClass} shrink-0 pointer-events-none select-none`}>
            {/* SVG Document shape chassis */}
            <svg
                viewBox="0 0 40 50"
                className="w-full h-full drop-shadow-[0_2px_5px_rgba(0,0,0,0.2)]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id={`grad-${gradIdSuffix}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={gradient.start} />
                        <stop offset="100%" stopColor={gradient.end} />
                    </linearGradient>
                </defs>
                {/* File outline card */}
                <path
                    d="M 4 2 
                       H 28 
                       L 38 12 
                       V 46 
                       A 2 2 0 0 1 36 48 
                       H 6 
                       A 2 2 0 0 1 4 46 
                       Z"
                    fill={`url(#grad-${gradIdSuffix})`}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1.2"
                />
                {/* Fold corner */}
                <path
                    d="M 28 2 
                       V 10 
                       A 2 2 0 0 0 30 12 
                       H 38 
                       Z"
                    fill="rgba(255, 255, 255, 0.25)"
                />
            </svg>

            {/* Centered Overlay Lucide icon and Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-[20%] text-white">
                <Icon className="w-1/2 h-1/2 opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" strokeWidth={2.0} />
                {label && (
                    <span className="text-[7.5px] font-bold tracking-wider mt-1 uppercase opacity-90 drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.4)] truncate max-w-full">
                        {label}
                    </span>
                )}
            </div>
        </div>
    );
}
