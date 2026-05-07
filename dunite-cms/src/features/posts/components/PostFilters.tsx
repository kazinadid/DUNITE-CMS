'use client';

import { Search } from 'lucide-react';

import type { StatusFilter } from '../types';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'draft',     label: 'Drafts' },
];

interface PostFiltersProps {
  query:           string;
  status:          StatusFilter;
  onQueryChange:   (q: string) => void;
  onStatusChange:  (s: StatusFilter) => void;
  counts?:         Partial<Record<StatusFilter, number>>;
}

export function PostFilters({
  query,
  status,
  onQueryChange,
  onStatusChange,
  counts,
}: PostFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
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
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
        />
      </div>

      {/* Status segmented control */}
      <div
        role="tablist"
        aria-label="Filter posts by status"
        className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1"
      >
        {FILTERS.map((f) => {
          const active = status === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(f.id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f.label}
              {counts?.[f.id] !== undefined && (
                <span className="ml-1.5 text-gray-400">{counts[f.id]}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
