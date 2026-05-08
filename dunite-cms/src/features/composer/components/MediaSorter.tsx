'use client';

import { Film, FileText, GripVertical, Image as ImageIcon, Loader2, Music, X } from 'lucide-react';
import { useState } from 'react';

import type { ComposerMedia, FileKind } from '../types';

interface MediaSorterProps {
  items:     ComposerMedia[];
  /** Reorder callback — caller is responsible for committing the new array. */
  onReorder: (next: ComposerMedia[]) => void;
  onRemove:  (uid: string) => void;
  disabled?: boolean;
}

const FALLBACK_ICON: Record<FileKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  other: FileText,
};

/**
 * Drag-to-reorder list of media items. Pure HTML5 drag/drop — zero
 * dependencies, smooth animations courtesy of `transition`. Each tile
 * shows a thumbnail (image / video poster / icon), filename + size,
 * upload status, and a remove button.
 */
export function MediaSorter({ items, onReorder, onRemove, disabled }: MediaSorterProps) {
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [overUid,     setOverUid]     = useState<string | null>(null);

  if (items.length === 0) return null;

  function move(fromUid: string, toUid: string) {
    if (fromUid === toUid) return;
    const fromIdx = items.findIndex((m) => m.uid === fromUid);
    const toIdx   = items.findIndex((m) => m.uid === toUid);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    onReorder(next);
  }

  return (
    <ul
      role="list"
      aria-label="Attached media (reorderable)"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((m, idx) => {
        const isImage = m.fileType === 'image';
        const isVideo = m.fileType === 'video';
        const Icon    = FALLBACK_ICON[m.fileType];
        const url     = m.kind === 'pending' ? m.previewUrl : m.fileUrl;
        const dragging = draggingUid === m.uid;
        const over     = overUid === m.uid;

        return (
          <li
            key={m.uid}
            draggable={!disabled}
            onDragStart={(e) => {
              if (disabled) return;
              setDraggingUid(m.uid);
              e.dataTransfer.effectAllowed = 'move';
              try {
                e.dataTransfer.setData('text/plain', m.uid);
              } catch { /* Some browsers block setData inside onDragStart in tests */ }
            }}
            onDragOver={(e) => {
              if (disabled) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overUid !== m.uid) setOverUid(m.uid);
            }}
            onDragLeave={() => setOverUid((cur) => (cur === m.uid ? null : cur))}
            onDrop={(e) => {
              if (disabled) return;
              e.preventDefault();
              const fromUid = (e.dataTransfer.getData('text/plain') || draggingUid) ?? '';
              if (fromUid) move(fromUid, m.uid);
              setDraggingUid(null);
              setOverUid(null);
            }}
            onDragEnd={() => {
              setDraggingUid(null);
              setOverUid(null);
            }}
            className={[
              'group relative flex select-none flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition',
              dragging ? 'opacity-50 scale-[0.98]' : 'opacity-100',
              over     ? 'border-[#7A0000]/60 ring-2 ring-[#7A0000]/15' : 'border-gray-200',
              disabled ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing',
            ].join(' ')}
          >
            {/* Thumbnail */}
            <div className="relative aspect-square w-full bg-gray-100">
              {isImage && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={m.name || 'Attached image'}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : isVideo && url ? (
                <video
                  src={url}
                  muted
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <Icon size={28} aria-hidden />
                </div>
              )}

              {/* Order badge */}
              <span className="absolute left-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {idx + 1}
              </span>

              {/* Drag handle */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100"
              >
                <GripVertical size={12} />
              </span>

              {/* Upload status */}
              {m.kind === 'pending' && m.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow ring-1 ring-gray-200">
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    {typeof m.progress === 'number' ? `${m.progress}%` : 'Uploading…'}
                  </span>
                </div>
              )}

              {m.kind === 'pending' && m.status === 'failed' && (
                <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-[11px] font-medium text-white">
                  {m.errorMessage ?? 'Upload failed'}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px]">
              <span className="line-clamp-1 text-gray-700">{m.name || 'Untitled'}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(m.uid)}
                aria-label={`Remove ${m.name || 'media'}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-red-600"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
