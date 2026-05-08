'use client';

import { useCallback, useMemo, useState } from 'react';
import { Copy, Download, Image as ImageIcon, Minus, PenLine, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Role } from '@/features/auth';

import { enqueueComposerMediaReuse } from '../lib/composerReuseQueue';
import { uploaderDisplayName } from '../lib/displayNames';
import {
  canDeleteLibraryRow,
  canModifyLibraryRow,
  canReuseInComposer,
  isMediaViewer,
} from '../lib/mediaPermissions';
import type { LibraryMediaRow, MediaCategory } from '../types';

function fmtBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function categoryLabel(row: LibraryMediaRow): string {
  const mc = row.media_categories;
  if (!mc) return 'Uncategorized';
  if (Array.isArray(mc)) return mc[0]?.label ?? 'Uncategorized';
  return mc.label;
}

function reusePayload(row: LibraryMediaRow) {
  return {
    id:             row.id,
    file_url:       row.file_url,
    file_type:      row.file_type,
    file_name:      row.file_name,
    mime_type:      row.mime_type,
    size:           row.size,
    storage_path:   row.storage_path,
    thumbnail_url:  row.thumbnail_url,
    thumbnail_path: row.thumbnail_path,
  };
}

export interface MediaPreviewModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  row: LibraryMediaRow | null;
  categories: MediaCategory[];
  role: Role;
  currentUserId: string;
  busy: boolean;
  onDelete: (id: string) => void;
  onMoveCategory: (id: string, categoryId: string | null) => void;
}

function ImagePreviewZoom({ row }: { row: LibraryMediaRow }) {
  const [zoom, setZoom] = useState(1);

  return (
    <>
      <div className="sticky top-0 z-[1] flex w-full flex-wrap items-center justify-center gap-1 border-b bg-muted/90 p-2 backdrop-blur-sm">
        <span className="mr-auto text-[10px] font-medium text-muted-foreground">Zoom</span>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
        >
          <Minus className="size-3" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          <Plus className="size-3" aria-hidden />
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={() => setZoom(1)}>
          Reset
        </Button>
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {row.file_type}
        </span>
      </div>
      <div className="flex min-h-[200px] w-full flex-1 items-center justify-center overflow-auto p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.file_url}
          alt=""
          className="max-h-[min(70vh,560px)] max-w-full object-contain"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        />
      </div>
    </>
  );
}

export function MediaPreviewModal({
  open,
  onOpenChange,
  row,
  categories,
  role,
  currentUserId,
  busy,
  onDelete,
  onMoveCategory,
}: MediaPreviewModalProps) {
  const router = useRouter();

  const canEditRow = row ? canModifyLibraryRow(role, row, currentUserId) : false;
  const canDelete = row ? canDeleteLibraryRow(role, row, currentUserId) : false;

  const copyUrl = useCallback(async () => {
    if (!row?.file_url) return;
    try {
      await navigator.clipboard.writeText(row.file_url);
    } catch {
      //
    }
  }, [row]);

  const dims = useMemo(() => {
    if (!row?.width_px || !row?.height_px) return '—';
    return `${row.width_px} × ${row.height_px}px`;
  }, [row?.width_px, row?.height_px]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100] max-h-[92vh] w-[min(96vw,900px)] max-w-none overflow-y-auto gap-0 p-0 sm:max-w-[900px]">
        <DialogHeader className="border-b px-4 py-3 sm:px-5">
          <DialogTitle className="line-clamp-2 pr-8">
            {row?.file_name ?? 'Preview'}
          </DialogTitle>
          <DialogDescription>
            {row?.is_library ? 'Central library asset' : 'Attached to post'} · Role-aware controls
          </DialogDescription>
        </DialogHeader>

        {row && (
          <>
            <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:p-5">
              <div className="relative flex min-h-[200px] flex-col items-center justify-center overflow-auto rounded-xl border bg-muted">
                {row.file_type === 'video' ? (
                  <video
                    src={row.file_url}
                    controls
                    playsInline
                    className="max-h-[min(70vh,520px)] w-full object-contain"
                  />
                ) : row.file_url ? (
                  <ImagePreviewZoom key={row.id} row={row} />
                ) : (
                  <ImageIcon className="size-16 text-muted-foreground opacity-40" aria-hidden />
                )}
                {row.file_type === 'video' ? (
                  <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                    {row.file_type}
                  </span>
                ) : null}
              </div>

              <div className="space-y-4 text-sm">
                <dl className="space-y-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Uploader</dt>
                    <dd className="text-right font-medium">{uploaderDisplayName(row)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Uploaded</dt>
                    <dd className="text-right">{fmtDate(row.created_at)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="text-right">{fmtBytes(row.size)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Dimensions</dt>
                    <dd className="text-right">{dims}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Folder</dt>
                    <dd className="text-right">{categoryLabel(row)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Uses</dt>
                    <dd className="text-right text-muted-foreground">
                      Pending analytics
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Scope</dt>
                    <dd className="text-right">
                      {row.is_library ? 'Library' : 'Post attachment'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="shrink-0 text-muted-foreground">Storage path</dt>
                    <dd
                      className="max-w-[min(20rem,55vw)] break-all text-right font-mono text-[10px] leading-snug text-foreground/90"
                      title={row.storage_path}
                    >
                      {row.storage_path}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">MIME</dt>
                    <dd className="break-all text-right text-xs">{row.mime_type}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                    Attached posts linkage will ship in a dedicated publishing insights module.
                  </div>
                </dl>

                {row.is_library && canEditRow && !isMediaViewer(role) && (
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    Folder
                    <select
                      value={row.category_id ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        onMoveCategory(row.id, e.target.value === '' ? null : e.target.value)
                      }
                      className="h-9 rounded-lg border bg-background px-2"
                    >
                      <option value="">Uncategorized</option>
                      {categories
                        .filter((c) => c.slug !== 'uncategorized')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <DialogFooter className="flex flex-wrap gap-2 border-t bg-muted/30 px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl()}>
                <Copy className="size-3.5" aria-hidden />
                Copy URL
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={row.file_url} download={row.file_name} target="_blank" rel="noreferrer">
                  <Download className="size-3.5" aria-hidden />
                  Download
                </a>
              </Button>
              {canReuseInComposer(role) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    enqueueComposerMediaReuse([reusePayload(row)]);
                    onOpenChange(false);
                    router.push('/dashboard/posts/compose');
                  }}
                >
                  <PenLine className="size-3.5" aria-hidden />
                  Use in Composer
                </Button>
              )}
              {row.is_library && canDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  className="sm:ml-auto"
                  onClick={() => void onDelete(row.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove from library
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
