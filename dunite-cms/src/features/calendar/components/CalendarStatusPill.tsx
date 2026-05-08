'use client';

import type { PostStatus } from '@/features/posts';
import { cn } from '@/lib/utils';

interface CalendarStatusPillProps {
  status: PostStatus;
  compact?: boolean;
  className?: string;
}

/**
 * Planner-specific status colours (scheduled = blue per product brief — distinct
 * from the amber “Scheduled” cue used on the generic posts feed badge).
 */
const STATUS_STYLES: Record<
  PostStatus,
  { label: string; pill: string; dot?: string }
> = {
  draft: {
    label: 'Draft',
    pill: 'border border-neutral-200/90 bg-neutral-100/95 text-neutral-700 ring-1 ring-inset ring-white/70',
    dot: 'bg-neutral-500',
  },
  scheduled: {
    label: 'Scheduled',
    pill: 'border border-sky-200/90 bg-sky-50 text-sky-800 ring-1 ring-inset ring-white/70',
    dot: 'bg-sky-500',
  },
  publishing: {
    label: 'Publishing',
    pill: 'border border-amber-200/90 bg-amber-50 text-amber-900 ring-1 ring-inset ring-white/70',
    dot: 'bg-amber-500',
  },
  published: {
    label: 'Published',
    pill: 'border border-emerald-200/90 bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-white/70',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    pill: 'border border-red-200/90 bg-red-50 text-red-800 ring-1 ring-inset ring-white/75',
    dot: 'bg-red-600',
  },
};

export function CalendarStatusPill({
  status,
  compact,
  className,
}: CalendarStatusPillProps) {
  const s = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold tracking-tight whitespace-nowrap',
        compact ? 'px-2 py-[3px] text-[9px] leading-none' : 'px-2 py-1 text-[10px] leading-none',
        s.pill,
        className,
      )}
      title={s.label}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot)}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
