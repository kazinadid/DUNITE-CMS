'use client';

import { memo, useMemo } from 'react';
import { Film, Image as ImageIcon, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { uploaderDisplayName } from '../lib/displayNames';
import type { LibraryMediaRow } from '../types';

function categoryLabel(row: LibraryMediaRow): string {
  const mc = row.media_categories;
  if (!mc) return '—';
  if (Array.isArray(mc)) return mc[0]?.label ?? '—';
  return mc.label;
}

export interface MediaLibraryAssetCardProps {
  row: LibraryMediaRow;
  view: 'grid' | 'list';
  bulkEnabled: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenPreview: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (v: boolean) => void;
  onUseInComposer?: () => void;
  className?: string;
}

export const MediaLibraryAssetCard = memo(function MediaLibraryAssetCard({
  row,
  view,
  bulkEnabled,
  selected,
  onToggleSelected,
  onOpenPreview,
  menuOpen,
  onMenuOpenChange,
  onUseInComposer,
  className,
}: MediaLibraryAssetCardProps) {
  const thumb = useMemo(() => {
    return row.file_type === 'image' && row.thumbnail_url
      ? row.thumbnail_url
      : row.file_type === 'image'
        ? row.file_url
        : row.thumbnail_url;
  }, [
    row.file_type,
    row.file_url,
    row.thumbnail_url,
  ]);

  const dims =
    row.width_px && row.height_px ? `${row.width_px}×${row.height_px}` : null;

  const fallbackIcon =
    row.file_type === 'image' ? ImageIcon : Film;

  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:border-[#7A0000]/30 hover:shadow-md',
        selected && 'ring-2 ring-[#7A0000]/35',
        className,
      )}
    >
      {view === 'list' ? (
        <div className="flex gap-4 p-2">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
            {row.file_type === 'image' && thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
            {row.file_type === 'video' && (
              <>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Film className="size-8 text-muted-foreground opacity-50" aria-hidden />
                  </div>
                )}
              </>
            )}
            <span className="pointer-events-none absolute top-1.5 left-1.5 rounded bg-black/65 px-1 py-px text-[9px] font-semibold text-white uppercase">
              {row.file_type}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between py-2 pr-2">
            <div>
              <p className="truncate text-sm font-medium">{row.file_name}</p>
              <p className="text-[11px] text-muted-foreground">{uploaderDisplayName(row)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {categoryLabel(row)} · {(dims ?? '—')} · Uses pending
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {bulkEnabled && (
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelected}
                    aria-label={`Select ${row.file_name}`}
                  />
                  Select
                </label>
              )}
              <Button size="xs" variant="outline" type="button" onClick={onOpenPreview}>
                Preview
              </Button>
              {onUseInComposer && row.is_library && (
                <Button size="xs" variant="outline" type="button" onClick={onUseInComposer}>
                  Composer
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenPreview}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenPreview();
              }
            }}
            className="group/card relative cursor-pointer outline-none ring-offset-2 transition hover:brightness-[1.02] focus-visible:ring-2 focus-visible:ring-[#7A0000]/40"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              {row.file_type === 'image' && thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  sizes="(max-width: 640px) 50vw, 260px"
                  className="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.025]"
                />
              )}
              {row.file_type === 'video' && (
                <>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <Film className="size-12 text-muted-foreground opacity-50" aria-hidden />
                    </div>
                  )}
                </>
              )}
              {row.file_type === 'image' && !thumb && (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <ImageIcon className="size-12 text-muted-foreground opacity-35" aria-hidden />
                </div>
              )}
              <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                {row.file_type}
              </span>
              {bulkEnabled && (
                <div
                  className="absolute top-2 right-2 z-10"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <label className="flex cursor-pointer items-center rounded-md bg-black/55 p-1 backdrop-blur-sm">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={onToggleSelected}
                      aria-label={`Select ${row.file_name}`}
                      className="size-4 accent-[#7A0000]"
                    />
                  </label>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 to-transparent p-4 pt-16">
                <p className="truncate text-[12px] font-medium text-white" title={row.file_name}>
                  {row.file_name}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[11px] text-muted-foreground">{uploaderDisplayName(row)}</p>
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 text-muted-foreground"
                  aria-label="More actions"
                  onClick={() => onMenuOpenChange(!menuOpen)}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
                {menuOpen && (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="fixed inset-0 z-20 cursor-default"
                      aria-hidden
                      onClick={() => onMenuOpenChange(false)}
                    />
                    <ul className="absolute top-full right-0 z-30 mt-0.5 min-w-[10.5rem] rounded-lg border bg-popover py-1 text-xs shadow-lg ring-1 ring-foreground/5">
                      <li>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onClick={() => {
                            onMenuOpenChange(false);
                            onOpenPreview();
                          }}
                        >
                          Open preview
                        </button>
                      </li>
                      {onUseInComposer && row.is_library && (
                        <li>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted"
                            onClick={() => {
                              onMenuOpenChange(false);
                              onUseInComposer();
                            }}
                          >
                            Use in Composer
                          </button>
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{categoryLabel(row)}</p>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {(dims ?? '—')} · Uses pending
            </p>
          </div>
        </>
      )}
    </li>
  );
});
