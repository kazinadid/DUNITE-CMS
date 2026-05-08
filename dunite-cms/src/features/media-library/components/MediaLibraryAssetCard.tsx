'use client';

import { memo, useMemo } from 'react';
import {
  Copy,
  Eye,
  Film,
  FolderInput,
  Image as ImageIcon,
  MoreHorizontal,
  PenLine,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { uploaderDisplayName } from '../lib/displayNames';
import type { LibraryMediaRow, MediaCategory } from '../types';

function categoryLabel(row: LibraryMediaRow): string {
  const mc = row.media_categories;
  if (!mc) return 'Uncategorized';
  if (Array.isArray(mc)) return mc[0]?.label ?? 'Uncategorized';
  return mc.label;
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export interface MediaLibraryAssetCardProps {
  row: LibraryMediaRow;
  view: 'grid' | 'list';
  bulkEnabled: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenPreview: () => void;
  onCopyUrl: () => void | Promise<void>;
  onUseInComposer?: () => void;
  onMoveToCategory: (categoryId: string | null) => void;
  onDelete: () => void;
  categories: MediaCategory[];
  showComposerAction: boolean;
  showMoveAction: boolean;
  showDeleteAction: boolean;
  className?: string;
}

function CardActionsMenu({
  row,
  categories,
  onOpenPreview,
  onCopyUrl,
  onUseInComposer,
  onMoveToCategory,
  onDelete,
  showComposerAction,
  showMoveAction,
  showDeleteAction,
  variant,
}: Pick<
  MediaLibraryAssetCardProps,
  | 'row'
  | 'categories'
  | 'onOpenPreview'
  | 'onCopyUrl'
  | 'onUseInComposer'
  | 'onMoveToCategory'
  | 'onDelete'
  | 'showComposerAction'
  | 'showMoveAction'
  | 'showDeleteAction'
> & { variant: 'icon' | 'outline' }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant === 'icon' ? 'ghost' : 'outline'}
          size={variant === 'icon' ? 'icon-xs' : 'sm'}
          className={cn(
            variant === 'icon' && 'size-7 text-muted-foreground',
            variant === 'outline' && 'gap-1.5 px-2 text-xs',
          )}
          aria-label={`More actions for ${row.file_name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden />
          {variant === 'outline' ? <span>Actions</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onOpenPreview();
          }}
        >
          <Eye className="mr-2 size-3.5 opacity-70" aria-hidden />
          Preview
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void onCopyUrl();
          }}
        >
          <Copy className="mr-2 size-3.5 opacity-70" aria-hidden />
          Copy URL
        </DropdownMenuItem>
        {showComposerAction && row.is_library && onUseInComposer ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onUseInComposer();
            }}
          >
            <PenLine className="mr-2 size-3.5 opacity-70" aria-hidden />
            Use in Composer
          </DropdownMenuItem>
        ) : null}

        {showMoveAction ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex cursor-default select-none items-center rounded-md px-2 py-2 text-xs outline-none focus:bg-accent data-[state=open]:bg-accent">
              <FolderInput className="mr-2 size-3.5 opacity-70" aria-hidden />
              Move to folder
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 max-h-[min(50vh,280px)] overflow-y-auto">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onMoveToCategory(null);
                }}
              >
                Uncategorized
              </DropdownMenuItem>
              {categories
                .filter((c) => c.slug !== 'uncategorized')
                .map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      onMoveToCategory(c.id);
                    }}
                  >
                    {c.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {showDeleteAction ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              <Trash2 className="mr-2 size-3.5" aria-hidden />
              Remove from library
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const MediaLibraryAssetCard = memo(function MediaLibraryAssetCard({
  row,
  view,
  bulkEnabled,
  selected,
  onToggleSelected,
  onOpenPreview,
  onCopyUrl,
  onUseInComposer,
  onMoveToCategory,
  onDelete,
  categories,
  showComposerAction,
  showMoveAction,
  showDeleteAction,
  className,
}: MediaLibraryAssetCardProps) {
  const thumb = useMemo(() => {
    return row.file_type === 'image' && row.thumbnail_url
      ? row.thumbnail_url
      : row.file_type === 'image'
        ? row.file_url
        : row.thumbnail_url;
  }, [row.file_type, row.file_url, row.thumbnail_url]);

  const dims =
    row.width_px && row.height_px ? `${row.width_px}×${row.height_px}` : null;

  const ariaLabel = `Open preview for ${row.file_name}`;

  const menuProps = {
    row,
    categories,
    onOpenPreview,
    onCopyUrl,
    onUseInComposer,
    onMoveToCategory,
    onDelete,
    showComposerAction,
    showMoveAction,
    showDeleteAction,
  };

  if (view === 'list') {
    return (
      <li
        className={cn(
          'relative overflow-visible rounded-2xl border bg-card shadow-sm transition hover:border-[#7A0000]/25 hover:shadow-md',
          selected && 'ring-2 ring-[#7A0000]/35',
          className,
        )}
      >
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
              <p className="text-[11px] text-muted-foreground">
                {uploaderDisplayName(row)} · {shortDate(row.created_at)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">
                    {categoryLabel(row)}
                  </span>
                  · {(dims ?? '—')} · Uses pending
                </span>
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
              <CardActionsMenu {...menuProps} variant="outline" />
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'relative overflow-visible rounded-2xl border bg-card shadow-sm transition hover:border-[#7A0000]/30 hover:shadow-md',
        selected && 'ring-2 ring-[#7A0000]/35',
        className,
      )}
    >
      <div
        className="group/card relative cursor-pointer outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7A0000]/40"
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={onOpenPreview}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenPreview();
          }
        }}
      >
        <div className="relative overflow-hidden rounded-t-2xl bg-muted">
          <div className="relative aspect-[4/3] w-full">
            {row.file_type === 'image' && thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                loading="lazy"
                decoding="async"
                sizes="(max-width: 640px) 50vw, 260px"
                className="h-full w-full object-cover transition duration-300 group-hover/card:scale-[1.02]"
              />
            )}
            {row.file_type === 'video' && (
              <>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
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
                className="absolute top-2 right-2 z-[2]"
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

            <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-end gap-1 px-2 opacity-0 transition-opacity duration-200 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="pointer-events-auto border border-white/20 bg-black/45 text-white shadow-sm backdrop-blur-sm hover:bg-black/55"
                aria-label="Preview"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPreview();
                }}
              >
                <Eye className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="pointer-events-auto border border-white/20 bg-black/45 text-white shadow-sm backdrop-blur-sm hover:bg-black/55"
                aria-label="Copy public URL"
                onClick={(e) => {
                  e.stopPropagation();
                  void onCopyUrl();
                }}
              >
                <Copy className="size-3.5" aria-hidden />
              </Button>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 to-transparent p-4 pt-16">
              <p className="truncate text-[12px] font-medium text-white" title={row.file_name}>
                {row.file_name}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 rounded-b-2xl p-3 pt-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground">{uploaderDisplayName(row)}</p>
            <p className="text-[10px] tabular-nums text-muted-foreground">{shortDate(row.created_at)}</p>
          </div>
          <CardActionsMenu {...menuProps} variant="icon" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex max-w-full items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/85">
            {categoryLabel(row)}
          </span>
        </div>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {(dims ?? '—')} · Uses pending
        </p>
      </div>
    </li>
  );
});
