'use client';

import { useCallback, useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { listPickerMediaPage } from '../services/mediaLibraryService';
import type { LibraryMediaRow } from '../types';

function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface MediaPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Max assets user can still add; caps selection count. */
  remainingSlots: number;
  onConfirm: (rows: LibraryMediaRow[]) => void;
}

export function MediaPickerModal({
  open,
  onOpenChange,
  remainingSlots,
  onConfirm,
}: MediaPickerModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LibraryMediaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Map<string, LibraryMediaRow>());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setSearchInput('');
        setDebouncedSearch('');
        setPage(1);
        setSelected(new Map());
        setRows([]);
        setTotal(0);
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const loadFirstPage = useCallback(async () => {
    if (!open) return;
    if (remainingSlots <= 0) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listPickerMediaPage({
        page: 1,
        search: debouncedSearch,
      });
      setRows(res.rows);
      setTotal(res.total);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [open, debouncedSearch, remainingSlots]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async list sync via loadFirstPage()
    void loadFirstPage();
  }, [loadFirstPage]);

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadMoreLoading) return;
    const nextPage = page + 1;
    setLoadMoreLoading(true);
    setError(null);
    try {
      const res = await listPickerMediaPage({
        page: nextPage,
        search: debouncedSearch,
      });
      setRows((prev) => [...prev, ...res.rows]);
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setLoadMoreLoading(false);
    }
  }, [hasMore, loadMoreLoading, page, debouncedSearch]);

  const toggle = useCallback(
    (row: LibraryMediaRow) => {
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(row.id)) {
          next.delete(row.id);
          return next;
        }
        if (next.size >= remainingSlots) return prev;
        next.set(row.id, row);
        return next;
      });
    },
    [remainingSlots],
  );

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selected.values()));
    setSelected(new Map());
    onOpenChange(false);
  }, [onConfirm, onOpenChange, selected]);

  const atCap = remainingSlots <= 0;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-h-[min(92vh,760px)] w-[min(96vw,880px)] gap-0 overflow-hidden p-0 sm:max-w-[880px]"
        showCloseButton
      >
        <DialogHeader className="border-b px-4 py-3 sm:px-5">
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            {atCap
              ? 'Remove attachments or raise platform limits to add more from the library.'
              : `Select up to ${remainingSlots} asset${remainingSlots === 1 ? '' : 's'}. Reuses the stored file — no duplicate upload.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by filename…"
              disabled={atCap}
              className="h-9 pl-8"
              aria-label="Search media"
            />
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : `${total} matches`}
          </p>
        </div>

        <div className="min-h-[320px] max-h-[min(52vh,440px)] overflow-y-auto px-3 py-3 sm:px-4">
          {error && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" aria-hidden />
              <span className="text-sm">Loading media…</span>
            </div>
          )}

          {!loading && !atCap && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <ImageIcon className="size-10 opacity-40" aria-hidden />
              <p className="text-sm">No media matches this search.</p>
            </div>
          )}

          {!loading && atCap && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <p className="text-sm">Attachment slots are full.</p>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {rows.map((row) => {
                const isSel = selected.has(row.id);
                const isImg = row.file_type === 'image';
                const thumb = isImg && row.thumbnail_url ? row.thumbnail_url : null;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={!isSel && (atCap || selected.size >= remainingSlots)}
                      onClick={() => toggle(row)}
                      className={cn(
                        'group flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm ring-offset-2 transition hover:border-foreground/20',
                        isSel ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                        (atCap || (!isSel && selected.size >= remainingSlots)) && !isSel
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer',
                      )}
                    >
                      <div className="relative aspect-square bg-muted">
                        {isImg && thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            sizes="(max-width: 640px) 50vw, 180px"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                        {isImg && !thumb && row.file_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.file_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        )}
                        {row.file_type === 'video' && (
                          <>
                            {row.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.thumbnail_url}
                                alt=""
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Film className="size-10 text-muted-foreground opacity-60" aria-hidden />
                              </div>
                            )}
                            <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                              Video
                            </div>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 p-2">
                        <p className="truncate text-xs font-medium text-foreground" title={row.file_name}>
                          {row.file_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatBytes(row.size)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && hasMore && rows.length > 0 && (
            <div className="mt-4 flex justify-center pb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadMoreLoading}
                onClick={() => void loadMore()}
              >
                {loadMoreLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Loading…
                  </>
                ) : (
                  `Load more (${rows.length} / ${total})`
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={selected.size === 0 || atCap}>
            Attach {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
