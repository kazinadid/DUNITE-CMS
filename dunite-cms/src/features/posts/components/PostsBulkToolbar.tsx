'use client';

import { CalendarClock, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface PostsBulkToolbarProps {
  selectedCount: number;
  selectionMode: boolean;
  onToggleMode:  () => void;
  busy:           boolean;
  /** When false, destructive / publish bulk actions hide. */
  canManageBulk: boolean;
  canBulkPublish: boolean;
  onSelectAllPage: () => void;
  onClearSelection: () => void;
  onBulkDelete:   () => void;
  onBulkDraft:    () => void;
  onBulkPublish:  () => void;
  onBulkSchedule: () => void;
}

/**
 * Floating bulk strip — enters when selection mode is on and ≥1 tile selected.
 */
export function PostsBulkToolbar({
  selectedCount,
  selectionMode,
  onToggleMode,
  busy,
  canManageBulk,
  canBulkPublish,
  onSelectAllPage,
  onClearSelection,
  onBulkDelete,
  onBulkDraft,
  onBulkPublish,
  onBulkSchedule,
}: PostsBulkToolbarProps) {
  const visible = selectionMode && selectedCount > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleMode}
          aria-pressed={selectionMode}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition ring-1',
            selectionMode
              ? 'bg-[#7A0000]/10 text-[#7A0000] ring-[#7A0000]/25'
              : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50',
          )}
        >
          {selectionMode ? 'Cancel selection' : 'Select posts'}
        </button>
        {selectionMode && (
          <>
            <button
              type="button"
              onClick={onSelectAllPage}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Select page
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              disabled={busy || selectedCount === 0}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40"
            >
              Clear
            </button>
            <span className="text-xs font-medium text-gray-400">
              {selectedCount} selected
            </span>
          </>
        )}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)] transition-all duration-300',
          visible
            ? 'pointer-events-auto max-h-[200px] border-gray-200/90 opacity-100'
            : 'pointer-events-none max-h-0 overflow-hidden border-transparent py-0 opacity-0 shadow-none',
        )}
        aria-hidden={!visible}
      >
        {canManageBulk && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onBulkDraft}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Move to draft
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onBulkSchedule}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#7A0000] ring-1 ring-[#7A0000]/20 hover:bg-[#7A0000]/5 disabled:opacity-50"
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Schedule…
            </button>
          </>
        )}
        {canBulkPublish && (
          <button
            type="button"
            disabled={busy}
            onClick={onBulkPublish}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Publish now
          </button>
        )}
        {canManageBulk && (
          <button
            type="button"
            disabled={busy}
            onClick={onBulkDelete}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
