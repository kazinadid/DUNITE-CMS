'use client';

import { useId } from 'react';
import { ListChecks, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { ImportPreviewFilterMode } from '../lib/previewRowQuery';

const FILTER_OPTIONS: { value: ImportPreviewFilterMode; label: string }[] = [
  { value: 'all', label: 'All states' },
  { value: 'valid', label: 'Valid' },
  { value: 'warning', label: 'Warnings' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'has_errors', label: 'Has errors' },
  { value: 'has_warnings', label: 'Has warnings' },
  { value: 'duplicate_signal', label: 'Duplicate signals' },
];

export interface ImportPreviewToolbarProps {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  filterMode: ImportPreviewFilterMode;
  onFilterModeChange: (v: ImportPreviewFilterMode) => void;
  displayedCount: number;
  totalParsedCount: number;
  excludedCount: number;
  bulkSelectedCount: number;
  onSelectAllVisible: () => void;
  onClearBulkSelection: () => void;
  onRemoveSelected: () => void;
  onRemoveInvalid: () => void;
  onRemoveSkipped: () => void;
  onClearExclusions: () => void;
  onRevalidate: () => void;
  onRetryParse: () => void;
  onClearImport: () => void;
  canMutate: boolean;
  revalidateDisabled: boolean;
  retryDisabled: boolean;
  className?: string;
}

export function ImportPreviewToolbar({
  searchInput,
  onSearchInputChange,
  filterMode,
  onFilterModeChange,
  displayedCount,
  totalParsedCount,
  excludedCount,
  bulkSelectedCount,
  onSelectAllVisible,
  onClearBulkSelection,
  onRemoveSelected,
  onRemoveInvalid,
  onRemoveSkipped,
  onClearExclusions,
  onRevalidate,
  onRetryParse,
  onClearImport,
  canMutate,
  revalidateDisabled,
  retryDisabled,
  className,
}: ImportPreviewToolbarProps) {
  const searchId = useId();
  const filterId = useId();

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border border-foreground/10 bg-muted/15 p-3 sm:p-4',
        className,
      )}
      role="region"
      aria-label="Preview filters and preparation actions"
    >
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={searchId} className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id={searchId}
                value={searchInput}
                onChange={(e) => onSearchInputChange(e.target.value)}
                placeholder="Row, caption, platform, issue…"
                disabled={!canMutate || totalParsedCount === 0}
                className="h-9 pl-8"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={filterId} className="text-xs font-medium text-muted-foreground">
              Filter
            </label>
            <select
              id={filterId}
              value={filterMode}
              onChange={(e) => onFilterModeChange(e.target.value as ImportPreviewFilterMode)}
              disabled={!canMutate || totalParsedCount === 0}
              className={cn(
                'h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
              )}
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground lg:text-right">
          Showing{' '}
          <span className="font-medium text-foreground">{displayedCount.toLocaleString()}</span> of{' '}
          <span className="font-medium text-foreground">{totalParsedCount.toLocaleString()}</span>
          {excludedCount > 0 ? (
            <>
              {' '}
              · <span className="text-foreground">{excludedCount.toLocaleString()}</span> hidden from preview
            </>
          ) : null}
        </p>
      </div>

      <div className="grid min-w-0 gap-2 border-t border-border/60 pt-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 max-sm:w-full"
          disabled={!canMutate || displayedCount === 0}
          onClick={onSelectAllVisible}
        >
          <ListChecks className="size-3.5" aria-hidden />
          Select visible
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:w-full"
          disabled={!canMutate || bulkSelectedCount === 0}
          onClick={onClearBulkSelection}
        >
          Clear selection
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive hover:text-destructive max-sm:w-full"
          disabled={!canMutate || bulkSelectedCount === 0}
          onClick={onRemoveSelected}
        >
          <Trash2 className="size-3.5" aria-hidden />
          Remove selected
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:w-full"
          disabled={!canMutate || totalParsedCount === 0}
          onClick={onRemoveInvalid}
        >
          Remove invalid
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-sm:w-full"
          disabled={!canMutate || totalParsedCount === 0}
          onClick={onRemoveSkipped}
        >
          Remove skipped
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 max-sm:w-full"
          disabled={!canMutate || excludedCount === 0}
          onClick={onClearExclusions}
        >
          <X className="size-3.5" aria-hidden />
          Restore hidden
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 max-sm:w-full"
          disabled={!canMutate || revalidateDisabled}
          onClick={onRevalidate}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Re-validate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 max-sm:w-full"
          disabled={!canMutate || retryDisabled}
          onClick={onRetryParse}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Retry parse
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="lg:ml-auto max-sm:w-full"
          disabled={!canMutate}
          onClick={onClearImport}
        >
          Clear import
        </Button>
      </div>
    </div>
  );
}
