'use client';

import { ImagePlus, UploadCloud } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { MediaSorter } from './MediaSorter';
import type { ComposerMedia, FileKind } from '../types';

export interface MediaUploaderHandle {
  /** Programmatically open the OS file picker. */
  open: () => void;
}

interface MediaUploaderProps {
  items:    ComposerMedia[];
  onAdd:    (files: File[]) => void;
  onReorder:(next: ComposerMedia[]) => void;
  onRemove: (uid: string) => void;
  /** Cap (typically the tightest selected platform's `maxMedia`). */
  maxItems?: number;
  disabled?: boolean;
  accept?:   string;
}

export function fileKind(mime: string): FileKind {
  const top = mime.split('/')[0]?.toLowerCase();
  if (top === 'image') return 'image';
  if (top === 'video') return 'video';
  if (top === 'audio') return 'audio';
  return 'other';
}

/**
 * Drag & drop multi-file uploader. Presents a beautiful drop zone when
 * empty, becomes a compact "+ Add more" affordance once items exist, and
 * delegates ordering to `MediaSorter`. Honors `maxItems`.
 */
export const MediaUploader = forwardRef<MediaUploaderHandle, MediaUploaderProps>(
  function MediaUploader(
    {
      items,
      onAdd,
      onReorder,
      onRemove,
      maxItems,
      disabled,
      accept = 'image/*,video/*',
    },
    ref,
  ) {
    const fileRef           = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    useImperativeHandle(ref, () => ({
      open: () => fileRef.current?.click(),
    }));

    const remaining = typeof maxItems === 'number'
      ? Math.max(0, maxItems - items.length)
      : Infinity;
    const atCapacity = remaining <= 0;

    function handleFiles(list: FileList | null | undefined) {
      if (!list) return;
      const incoming = Array.from(list);
      if (incoming.length === 0) return;
      const accepted = Number.isFinite(remaining)
        ? incoming.slice(0, remaining)
        : incoming;
      if (accepted.length > 0) onAdd(accepted);
    }

    return (
      <div className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            // Reset so re-selecting the same file fires onChange again.
            if (fileRef.current) fileRef.current.value = '';
          }}
        />

        {items.length === 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              if (disabled) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (disabled) return;
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={[
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-gray-50 px-4 py-10 text-sm transition-all',
              dragOver
                ? 'border-[#7A0000]/60 bg-[#7A0000]/5 text-[#7A0000]'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
          >
            <UploadCloud
              size={26}
              className={dragOver ? 'text-[#7A0000]' : 'text-gray-400'}
              aria-hidden
            />
            <span className="font-medium">
              {dragOver ? 'Drop files to attach' : 'Drag & drop or click to upload'}
            </span>
            <span className="text-xs text-gray-400">
              Images and videos. {typeof maxItems === 'number' && `Up to ${maxItems}.`}
            </span>
          </button>
        ) : (
          <>
            <div
              onDragOver={(e) => {
                if (disabled || atCapacity) return;
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                if (disabled || atCapacity) return;
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={[
                'rounded-xl border border-dashed p-3 transition-colors',
                dragOver
                  ? 'border-[#7A0000]/60 bg-[#7A0000]/5'
                  : 'border-gray-200 bg-white',
              ].join(' ')}
            >
              <MediaSorter
                items={items}
                onReorder={onReorder}
                onRemove={onRemove}
                disabled={disabled}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-gray-500">
                <span>
                  {items.length} attached
                  {typeof maxItems === 'number' && ` · ${remaining} remaining`}
                </span>
                <button
                  type="button"
                  disabled={disabled || atCapacity}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ImagePlus size={12} aria-hidden />
                  Add more
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);
