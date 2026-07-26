import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { FileTypeIcon } from '../shared/FileTypeIcon';
import { TelegramFile } from '../../types';
import { isImageFile, isVideoFile } from '../../utils';

const thumbnailCache = new Map<string, string>();

interface MobileFileThumbnailProps {
  file: TelegramFile;
  folderId?: number | null;
  className?: string;
  iconSize?: 'sm' | 'md' | 'lg';
  objectFit?: 'cover' | 'contain';
}

export function MobileFileThumbnail({
  file,
  folderId = null,
  className = 'w-full h-full object-cover',
  iconSize = 'md',
  objectFit = 'cover',
}: MobileFileThumbnailProps) {
  const cacheKey = `${file.id}-${folderId ?? file.folder_id ?? 'root'}`;
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => thumbnailCache.get(cacheKey) || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (thumbnailCache.has(cacheKey)) {
      setThumbUrl(thumbnailCache.get(cacheKey)!);
      return;
    }

    if (isImageFile(file.name, file.mime_type) || isVideoFile(file.name, file.mime_type)) {
      setLoading(true);
      let cancelled = false;

      invoke<string>('cmd_get_thumbnail', {
        messageId: file.id,
        folderId: file.folder_id ?? folderId,
      })
        .then((result) => {
          if (!cancelled && result) {
            thumbnailCache.set(cacheKey, result);
            setThumbUrl(result);
          }
        })
        .catch((err) => {
          console.warn('[MobileFileThumbnail] Thumbnail load failed:', file.name, err);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }
  }, [file.id, file.name, file.mime_type, file.folder_id, folderId, cacheKey]);

  if (thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={file.name}
        className={`${className} ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-1">
        <Loader2 className="w-5 h-5 text-telegram-primary animate-spin opacity-70" />
      </div>
    );
  }

  return <FileTypeIcon filename={file.name} size={iconSize} />;
}
