'use client';

import { SlidersHorizontal } from 'lucide-react';

import type { PostSortOption } from '../services/postsService';

export interface PostsAdvancedFiltersState {
  platform:      string | 'all';
  authorId:      string | 'all';
  createdFrom:   string;
  createdTo:     string;
  scheduledFrom: string;
  scheduledTo:   string;
  sort:          PostSortOption;
}

interface PostsAdvancedFiltersProps {
  value:      PostsAdvancedFiltersState;
  onChange:   (next: PostsAdvancedFiltersState) => void;
  authorOptions: { id: string; name: string }[];
  showAuthorFilter: boolean;
}

const PLATFORMS = [
  { value: 'all',        label: 'All platforms' },
  { value: 'facebook',   label: 'Facebook' },
  { value: 'instagram',  label: 'Instagram' },
  { value: 'linkedin',   label: 'LinkedIn' },
  { value: 'twitter',    label: 'X / Twitter' },
] as const;

const SORTS: { value: PostSortOption; label: string }[] = [
  { value: 'newest',           label: 'Newest created' },
  { value: 'oldest',           label: 'Oldest created' },
  { value: 'scheduled_soon',    label: 'Scheduled soonest' },
  { value: 'failed_first',     label: 'Failed first' },
];

/**
 * Dense filter strip — paired with PostsToolbar tabs + search on the Posts page.
 */
export function PostsAdvancedFilters({
  value,
  onChange,
  authorOptions,
  showAuthorFilter,
}: PostsAdvancedFiltersProps) {
  const patch = (partial: Partial<PostsAdvancedFiltersState>) =>
    onChange({ ...value, ...partial });

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-3 shadow-inner ring-1 ring-black/[0.02] backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Refine feed
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Platform</span>
          <select
            value={value.platform}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ platform: e.target.value })}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {showAuthorFilter && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-500">Author</span>
            <select
              value={value.authorId}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
              onChange={(e) => patch({ authorId: e.target.value })}
            >
              <option value="all">All authors</option>
              {authorOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Created from</span>
          <input
            type="date"
            value={value.createdFrom}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ createdFrom: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Created to</span>
          <input
            type="date"
            value={value.createdTo}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ createdTo: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Scheduled from</span>
          <input
            type="date"
            value={value.scheduledFrom}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ scheduledFrom: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">Scheduled to</span>
          <input
            type="date"
            value={value.scheduledTo}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ scheduledTo: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2 xl:col-span-2">
          <span className="text-[11px] font-medium text-gray-500">Sort</span>
          <select
            value={value.sort}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#7A0000]/40 focus:ring-2 focus:ring-[#7A0000]/10"
            onChange={(e) => patch({ sort: e.target.value as PostSortOption })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
