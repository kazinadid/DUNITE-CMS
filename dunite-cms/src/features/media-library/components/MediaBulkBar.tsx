'use client';

import type { MediaCategory } from '../types';

export interface MediaBulkBarProps {
  count: number;
  categories: MediaCategory[];
  bulkDisabledReason?: string | null;
  busy: boolean;
  onClear: () => void;
  /** Admin + editor bulk; forbidden rows must be excluded before invoke. */
  onMoveFolder: (categoryId: string | null) => void;
  onDelete: () => void;
  /** Optional placeholder enterprise action. */
  onReuseDraft?: () => void;
}

export function MediaBulkBar({
  count,
  categories,
  bulkDisabledReason,
  busy,
  onClear,
  onMoveFolder,
  onDelete,
  onReuseDraft,
}: MediaBulkBarProps) {
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#7A0000]/20 bg-[#7A0000]/5 px-3 py-2.5 text-sm shadow-sm">
      <span className="font-semibold text-gray-900">
        {count} selected
      </span>
      {bulkDisabledReason && (
        <span className="text-xs text-muted-foreground">{bulkDisabledReason}</span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      >
        Clear selection
      </button>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wide">Move to</span>
        <select
          disabled={!!bulkDisabledReason || busy}
          defaultValue="__noop__"
          onChange={(e) => {
            const v = e.target.value;
            e.target.selectedIndex = 0;
            if (v === '__noop__') return;
            onMoveFolder(v === '' ? null : v);
          }}
          className="h-8 rounded-lg border bg-background px-2 text-xs"
        >
          <option value="__noop__">Choose folder…</option>
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
      {onReuseDraft && (
        <button
          type="button"
          disabled={!!bulkDisabledReason || busy}
          onClick={onReuseDraft}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Reuse bundle (soon)
        </button>
      )}
      <button
        type="button"
        disabled={!!bulkDisabledReason || busy}
        onClick={onDelete}
        className="ml-auto rounded-lg bg-[#7A0000] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#5A0000] disabled:opacity-50"
      >
        Delete selected
      </button>
    </div>
  );
}
