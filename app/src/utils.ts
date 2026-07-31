import { type as osType } from '@tauri-apps/plugin-os';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { toast } from 'sonner';

// ── Platform detection ────────────────────────────────────────────────
// Singleton — evaluated once at module load. Uses the Tauri OS plugin
// on native builds, falls back to navigator.userAgent in browser contexts.
export const isAndroidPlatform = ((): boolean => {
  try { return osType() === 'android'; }
  catch { return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent); }
})();

export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ── File type classification ────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'flv', 'm4v'] as const;
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus'] as const;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico', 'heic', 'heif'] as const;

const endsWithAny = (name: string, exts: readonly string[]) => {
    const lower = name.toLowerCase();
    return exts.some(ext => lower.endsWith('.' + ext) || lower.endsWith(ext));
};

export const isVideoFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (endsWithAny(name, VIDEO_EXTENSIONS)) return true;
    if (mime && mime.toLowerCase().startsWith('video/')) return true;
    return false;
};

export const isAudioFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (endsWithAny(name, AUDIO_EXTENSIONS)) return true;
    if (mime && mime.toLowerCase().startsWith('audio/')) return true;
    return false;
};

export const isMediaFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    return isVideoFile(name, mime) || isAudioFile(name, mime);
};

export const isImageFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (endsWithAny(name, IMAGE_EXTENSIONS)) return true;
    if (name.toLowerCase().startsWith('photo_') || name.toLowerCase() === 'photo.jpg') return true;
    if (mime && mime.toLowerCase().startsWith('image/')) return true;
    return false;
};

export const isPdfFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (name.toLowerCase().endsWith('.pdf')) return true;
    if (mime && mime.toLowerCase() === 'application/pdf') return true;
    return false;
};

const TEXT_EXTENSIONS = [
    'txt', 'text', 'json', 'md', 'markdown', 'log', 'csv', 'tsv',
    'xml', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
    'c', 'cpp', 'h', 'hpp', 'rs', 'go', 'sh', 'bat', 'cmd', 'ps1',
    'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env', 'sql'
] as const;

export const isTextFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (endsWithAny(name, TEXT_EXTENSIONS)) return true;
    if (mime) {
        const m = mime.toLowerCase();
        if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml' || m === 'application/javascript') {
            return true;
        }
    }
    return false;
};

const OFFICE_EXTENSIONS = [
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'odt', 'ods', 'odp', 'rtf', 'pages', 'numbers', 'key'
] as const;

export const isOfficeFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    if (endsWithAny(name, OFFICE_EXTENSIONS)) return true;
    if (mime) {
        const m = mime.toLowerCase();
        if (
            m.includes('word') ||
            m.includes('excel') ||
            m.includes('powerpoint') ||
            m.includes('officedocument') ||
            m.includes('opendocument') ||
            m.includes('msword') ||
            m.includes('ms-excel') ||
            m.includes('ms-powerpoint')
        ) {
            return true;
        }
    }
    return false;
};

export const isArchiveFile = (name: string, mime?: string) => {
    if (isExecutableFile(name, mime)) return false;
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'] as const;
    if (endsWithAny(name, archiveExts)) return true;
    if (mime) {
        const m = mime.toLowerCase();
        if (
            m === 'application/zip' ||
            m === 'application/x-zip-compressed' ||
            m === 'application/x-rar-compressed' ||
            m === 'application/x-7z-compressed' ||
            m === 'application/x-tar' ||
            m === 'application/gzip'
        ) {
            return true;
        }
    }
    return false;
};

const EXEC_EXTENSIONS = [
    // Windows Executables & Installers
    'exe', 'msi', 'scr', 'cpl', 'com', 'hta', 'gadget', 'msp', 'isu', 'pif',
    // Windows Scripts & Automation
    'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'reg', 'inf',
    // Macro-Enabled Documents
    'docm', 'xlsm', 'pptm', 'dotm', 'xltm',
    // Android & Java Packages
    'apk', 'jar', 'dex',
    // macOS Executables & Installers
    'app', 'dmg', 'pkg', 'command',
    // Linux Executables & Shell Scripts
    'bin', 'run', 'out', 'sh', 'bash', 'zsh'
] as const;

export const isExecutableFile = (name: string, mime?: string): boolean => {
    if (mime) {
        const m = mime.toLowerCase();
        if (
            m.includes('x-msdownload') ||
            m.includes('x-dosexec') ||
            m.includes('x-executable') ||
            m.includes('x-msi') ||
            m.includes('x-bat') ||
            m.includes('x-sh') ||
            m.includes('x-apple-diskimage') ||
            m.includes('application/vnd.android.package-archive') ||
            m.includes('portable-executable')
        ) {
            return true;
        }
    }
    const lowerName = name.toLowerCase();
    if (endsWithAny(lowerName, EXEC_EXTENSIONS)) return true;

    // Double extension detection (e.g. photo.pdf.exe or invoice.png.vbs)
    if (/\.(png|jpg|jpeg|pdf|docx|xlsx|txt)\.(exe|bat|vbs|ps1|scr|msi|cmd|com|app|apk|sh)$/i.test(lowerName)) {
        return true;
    }

    return false;
};

// ── HTML file input fallback for when Tauri dialog open() fails ──────────

export interface FileDialogFallbackOptions {
  directory?: boolean;
  multiple?: boolean;
}

// ── Retry + HTML fallback wrapper for Tauri dialogs ────────────────────

export async function pickWithFallback<T>(
    dialogFn: () => Promise<T | null>,
    onRetry: () => void,
    options: {
        errorTitle?: string;
        /** If provided, a "Browser Picker" button is shown that calls this function. */
        onBrowserPicker?: () => Promise<T | null>;
    } = {}
): Promise<T | null> {
    try {
        return await dialogFn();
    } catch (err) {
        console.error('Tauri dialog failed:', err);
        const errorTitle = options.errorTitle ?? 'Dialog failed';

        return await new Promise<T | null>((resolve) => {
            let resolved = false;
            let browserPickerClicked = false;
            const done = (val: T | null) => {
                if (resolved) return;
                resolved = true;
                resolve(val);
            };

            const toastOptions: Record<string, unknown> = {
                description: String(err),
                duration: 8000,
                action: {
                    label: 'Retry',
                    onClick: () => {
                        done(null);
                        onRetry();
                    },
                },
                onDismiss: () => {
                    if (!browserPickerClicked) done(null);
                },
                onAutoClose: () => {
                    if (!browserPickerClicked) done(null);
                },
            };

            if (options.onBrowserPicker) {
                toastOptions.cancel = {
                    label: 'Browser Picker',
                    onClick: async () => {
                        browserPickerClicked = true;
                        const result = await options.onBrowserPicker!();
                        done(result);
                    },
                };
            }

            toast.error(errorTitle, toastOptions as Parameters<typeof toast.error>[1]);
        });
    }
}

// ── Clipboard utility ────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<void> {
    try {
        await writeText(text);
    } catch {
        await navigator.clipboard.writeText(text);
    }
}

// ── Native Share API helper ────────────────────────────────────────────

export async function nativeShareOrCopy(
    name: string,
    sizeStr: string,
    link: string,
    onCopy?: (link: string) => void
): Promise<void> {
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (canShare) {
        try {
            await navigator.share({
                title: `Shared file: ${name}`,
                text: `Download "${name}" (${sizeStr}) via Telegram Drive`,
                url: link,
            });
            return;
        } catch (e: any) {
            if (e?.name !== 'AbortError') {
                toast.error('Share failed, but link has been copied');
            }
        }
    }
    if (onCopy) {
        onCopy(link);
    } else {
        navigator.clipboard.writeText(link);
        toast.success('Link copied to clipboard');
    }
}

export function showFileDialogFallback(options: FileDialogFallbackOptions = {}): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? true;

    if (options.directory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }

    let focusTimeout: ReturnType<typeof setTimeout> | undefined;
    let resolved = false;

    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (focusTimeout) clearTimeout(focusTimeout);
      input.remove();
    };

    const finish = (paths: string[]) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(paths);
    };

    input.onchange = () => {
      const paths: string[] = [];
      if (input.files) {
        for (let i = 0; i < input.files.length; i++) {
          const path = (input.files[i] as any).path as string | undefined;
          if (path && typeof path === 'string' && path.length > 0) {
            paths.push(path);
          }
        }
      }
      finish(paths);
    };

    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      focusTimeout = setTimeout(() => {
        if (input.parentNode) {
          finish([]);
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();
  });
}

export function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .replace(/^\.+|\.+$/g, '')
        || 'file';
}

// ── Drag ghost utility ────────────────────────────────────────────────

export function createDragGhost(name: string, isFolder?: boolean, count?: number): HTMLElement {
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.gap = '8px';
    ghost.style.padding = '8px 12px';
    ghost.style.background = 'rgba(30,30,35,0.95)';
    ghost.style.border = '1px solid rgba(0,136,204,0.4)';
    ghost.style.borderRadius = '8px';
    ghost.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
    ghost.style.maxWidth = '220px';

    const icon = document.createElement('span');
    icon.style.flexShrink = '0';
    icon.style.fontSize = '16px';
    icon.textContent = isFolder ? '📁' : '📄';
    ghost.appendChild(icon);

    const label = document.createElement('span');
    label.style.fontSize = '12px';
    label.style.fontWeight = '500';
    label.style.color = '#e4e4e7';
    label.style.whiteSpace = 'nowrap';
    label.style.overflow = 'hidden';
    label.style.textOverflow = 'ellipsis';
    label.textContent = name;
    ghost.appendChild(label);

    if (count && count > 1) {
        const badge = document.createElement('span');
        badge.style.flexShrink = '0';
        badge.style.marginLeft = '2px';
        badge.style.padding = '2px 6px';
        badge.style.background = 'rgba(0,136,204,0.85)';
        badge.style.color = '#fff';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = '700';
        badge.style.borderRadius = '10px';
        badge.style.lineHeight = '1.2';
        badge.style.minWidth = '18px';
        badge.style.textAlign = 'center';
        badge.textContent = String(count);
        ghost.appendChild(badge);
    }

    document.body.appendChild(ghost);
    return ghost;
}

export function formatDate(timestampStr?: string) {
    if (!timestampStr) return '-';
    const ts = parseInt(timestampStr, 10);
    if (isNaN(ts)) return timestampStr;
    if (ts < 10000000) return timestampStr;
    try {
        return new Date(ts * 1000).toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return timestampStr;
    }
}
