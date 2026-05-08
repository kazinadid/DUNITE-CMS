'use client';

import { Search, X } from 'lucide-react';

import type { StatusFilter } from '../types';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',        label: 'All'        },
  { id: 'draft',      label: 'Drafts'     },
  { id: 'scheduled',  label: 'Scheduled'  },
  { id: 'publishing', label: 'Publishing' },
  { id: 'published',  label: 'Published'  },
  { id: 'failed',     label: 'Failed'     },
];

interface PostsToolbarProps {
  query:           string;
  status:          StatusFilter;
  onQueryChange:   (q: string) => void;
  onStatusChange:  (s: StatusFilter) => void;
  counts?:         Partial<Record<StatusFilter, number>>;
  /** Optional aside on the right (e.g. a Refresh button). */
  trailing?:       React.ReactNode;
}

/**
 * Search + status-filter strip for the Posts feed. Designed to feel like
 * Linear / Buffer toolbars — sticky at the top of the feed on desktop,
 * stacks comfortably on mobile.
 */
export function PostsToolbar({
  query,
  status,
  onQueryChange,
  onStatusChange,
  counts,
  trailing,
}: PostsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Top row: search + trailing slot */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search posts…"
            aria-label="Search posts"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </div>

        {trailing && <div className="flex items-center gap-2">{trailing}</div>}
      </div>

      {/* Status segmented control — scrolls horizontally on mobile */}
      <div
        role="tablist"
        aria-label="Filter posts by status"
        className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 scrollbar-none"
      >
        {FILTERS.map((f) => {
          const active = status === f.id;
          const count  = counts?.[f.id];
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(f.id)}
              className={`group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f.label}
              {count !== undefined && (
                <span
                  className={`tabular-nums text-[10px] font-semibold ${
                    active ? 'text-gray-500' : 'text-gray-400 group-hover:text-gray-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
