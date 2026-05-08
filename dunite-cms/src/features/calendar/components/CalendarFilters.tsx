'use client';

import type { PostStatus } from '@/features/posts';
import { PLATFORM_ORDER, PLATFORMS } from '@/features/composer';

import { cn } from '@/lib/utils';

export interface CalendarFilterState {
  platform: 'all' | string;
  status:    'all' | PostStatus;
  userId:    'all' | string;
}

interface UserOption {
  id:   string;
  name: string;
}

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'publishing', label: 'Publishing' },
  { value: 'retrying', label: 'Retrying' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
];

interface CalendarFiltersProps {
  value:           CalendarFilterState;
  onChange:        (next: CalendarFilterState) => void;
  userOptions:     UserOption[];
  showUserFilter:  boolean;
  className?:      string;
}

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:min-w-[140px]';

export function CalendarFilters({
  value,
  onChange,
  userOptions,
  showUserFilter,
  className,
}: CalendarFiltersProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Platform
        <select
          className={selectClass}
          value={value.platform}
          onChange={(e) =>
            onChange({ ...value, platform: e.target.value as CalendarFilterState['platform'] })}
        >
          <option value="all">All platforms</option>
          {PLATFORM_ORDER.map((id) => (
            <option key={id} value={id}>
              {PLATFORMS[id].label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Status
        <select
          className={selectClass}
          value={value.status}
          onChange={(e) =>
            onChange({
              ...value,
              status: e.target.value as CalendarFilterState['status'],
            })}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {showUserFilter && (
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Author
          <select
            className={selectClass}
            value={value.userId}
            onChange={(e) =>
              onChange({
                ...value,
                userId: e.target.value as CalendarFilterState['userId'],
              })}
          >
            <option value="all">Everyone</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
