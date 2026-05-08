'use client';

import { FileText, Film, ImageIcon, Music } from 'lucide-react';
import { useState } from 'react';

import type { PostMedia } from '../types';

interface MediaThumbnailProps {
  media:    PostMedia;
  /** Tailwind aspect ratio class. Default 16/9 — matches feed cards. */
  aspect?:  string;
  /** When true, fall back to a small icon-only representation. */
  compact?: boolean;
  className?: string;
}

const FALLBACK_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
};

export function MediaThumbnail({
  media,
  aspect = 'aspect-[16/9]',
  compact = false,
  className = '',
}: MediaThumbnailProps) {
  const [errored, setErrored] = useState(false);
  const isImage = media.file_type === 'image' && Boolean(media.file_url) && !errored;
  const Icon = FALLBACK_ICON[media.file_type] ?? FileText;

  if (compact) {
    return (
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200 ${className}`}
        aria-hidden
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.file_url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Icon size={14} className="text-gray-500" />
        )}
      </span>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200 ${aspect} ${className}`}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.file_url}
          alt={media.file_name || 'Post media'}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
          <Icon size={26} aria-hidden />
          {media.file_name && (
            <span className="mt-1.5 line-clamp-1 max-w-[80%] text-xs font-medium text-gray-500">
              {media.file_name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
