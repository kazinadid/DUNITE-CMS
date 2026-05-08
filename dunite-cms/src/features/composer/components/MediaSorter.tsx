'use client';

import { Film, FileText, GripVertical, Image as ImageIcon, Music, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

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
 * Drag-to-reorder list of media tiles with cover badge + inline validations.
 */
export function MediaSorter({ items, onReorder, onRemove, disabled }: MediaSorterProps) {
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const [overUid, setOverUid] = useState<string | null>(null);

  if (items.length === 0) return null;

  function move(fromUid: string, toUid: string) {
    if (fromUid === toUid) return;
    const fromIdx = items.findIndex((mm) => mm.uid === fromUid);
    const toIdx   = items.findIndex((mm) => mm.uid === toUid);
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
        const isImage               = m.fileType === 'image';
        const isVideo               = m.fileType === 'video';
        const Icon                   = FALLBACK_ICON[m.fileType];
        const url                    = m.kind === 'pending' ? m.previewUrl : m.fileUrl;
        const dragging               = draggingUid === m.uid;
        const over                   = overUid === m.uid;
        const msgs                   = m.clientAttachmentMsgs ?? [];
        const hasErr                 = msgs.some((n) => n.level === 'error');

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
              } catch {
                //
              }
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
              const fromUid =
                e.dataTransfer.getData('text/plain') || draggingUid || '';
              if (fromUid) move(fromUid, m.uid);
              setDraggingUid(null);
              setOverUid(null);
            }}
            onDragEnd={() => {
              setDraggingUid(null);
              setOverUid(null);
            }}
            className={cn(
              'group relative flex select-none flex-col overflow-hidden rounded-xl border bg-white shadow-sm outline-none ring-offset-2 transition-[transform,box-shadow,opacity,border-color] duration-200 ease-out will-change-transform',
              dragging ? 'z-40 scale-[0.97] -rotate-[0.65deg] opacity-90 shadow-lg' : 'opacity-100',
              over ? 'border-[#7A0000]/60 ring-[#7A0000]/20 ring-2' : 'border-gray-200 ring-0',
              hasErr ? 'ring-2 ring-red-200 ring-offset-white' : '',
              disabled ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing',
            )}
          >
            <div className="relative aspect-square w-full bg-gray-100">
              {isImage && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={m.name || 'Attached image'}
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    'absolute inset-0 h-full w-full object-cover transition-transform duration-200',
                    dragging ? 'scale-105' : 'scale-100',
                  )}
                />
              ) : isVideo && url ? (
                <video
                  src={url}
                  muted
                  playsInline
                  className={cn(
                    'absolute inset-0 h-full w-full object-cover transition-transform duration-200',
                    dragging ? 'scale-105' : 'scale-100',
                  )}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <Icon size={28} aria-hidden />
                </div>
              )}

              {idx === 0 && (
                <span className="absolute bottom-2 right-2 inline-flex rounded-md bg-[#7A0000]/90 px-2 py-[2px] text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm">
                  Cover
                </span>
              )}

              <span className="absolute left-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {idx + 1}
              </span>

              <span
                aria-hidden
                className="pointer-events-none absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
              >
                <GripVertical size={12} />
              </span>

              {m.kind === 'pending' && m.status === 'uploading' && (
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/65 via-transparent to-transparent p-3">
                  <div className="h-1 overflow-hidden rounded-full bg-white/30">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-200"
                      style={{ width: `${m.progress ?? 12}%` }}
                    />
                  </div>
                  <span className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/90 tabular-nums">
                    uploading {typeof m.progress === 'number' ? `${Math.round(m.progress)}%` : '…'}
                  </span>
                </div>
              )}

              {m.kind === 'pending' && m.status === 'failed' && (
                <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-[11px] font-medium text-white">
                  {m.errorMessage ?? 'Upload failed'}
                </div>
              )}

              {m.kind === 'pending'
                && m.mediaProbe === 'loading'
                && m.status !== 'uploading'
                && m.status !== 'failed' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-2 bg-black/55 p-2">
                  <div className="h-1 animate-pulse overflow-hidden rounded-full bg-white/35">
                    <div className="h-full w-1/2 rounded-full bg-white/80" />
                  </div>
                  <p className="text-[10px] font-semibold text-white drop-shadow-md">Sizing media…</p>
                </div>
              )}
            </div>

            <div className="flex items-start justify-between gap-2 px-2.5 py-2 text-[11px]">
              <span className="line-clamp-2 min-w-0 flex-1 text-gray-700">
                {m.name || 'Untitled'}
              </span>
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

            {msgs.length > 0 && (
              <div className="space-y-0.5 border-t border-gray-100 bg-gray-50/90 px-2.5 pb-2 pt-1.5">
                {msgs.map((note, mi) => (
                  <p
                    key={`${note.level}-${mi}-${note.message}`}
                    className={cn(
                      'flex gap-1 text-[10px] font-medium leading-snug',
                      note.level === 'error' ? 'text-red-700' : 'text-amber-800',
                    )}
                  >
                    <span className="shrink-0">
                      {note.level === 'error' ? (
                        <span aria-hidden title="Blocked">
                          ✕
                        </span>
                      ) : (
                        <span aria-hidden title="Warning">
                          ⚠
                        </span>
                      )}
                    </span>
                    <span>{note.message}</span>
                  </p>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
