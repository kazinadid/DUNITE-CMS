'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';

import type { PostStatus } from '@/features/posts';
import { cn } from '@/lib/utils';

interface CalendarStatusPillProps {
  status:    PostStatus;
  compact?:  boolean;
  /** Larger pill with icon glyphs (modal / summaries). */
  emphasis?: 'default' | 'prominent';
  className?: string;
}

/** Planner-specific palette — scheduled reads as intentional blue cue. */
const STATUS_STYLES: Record<
  PostStatus,
  { label: string; pill: string; Icon?: LucideIcon; iconClass?: string; spin?: boolean }
> = {
  draft: {
    label:     'Draft',
    pill:
      'border border-neutral-200/90 bg-neutral-100 text-neutral-800 ring-1 ring-inset ring-white/65',
    Icon:      FileText,
    iconClass: 'text-neutral-600',
  },
  scheduled: {
    label:     'Scheduled',
    pill:
      'border border-sky-200 bg-sky-50 text-sky-900 ring-1 ring-inset ring-sky-200/65',
    Icon:      Clock,
    iconClass: 'text-sky-600',
  },
  publishing: {
    label:     'Publishing',
    pill:
      'border border-amber-200 bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-200/70',
    Icon:      Loader2,
    iconClass: 'text-amber-600',
    spin:      true,
  },
  published: {
    label:     'Published',
    pill:
      'border border-emerald-200 bg-emerald-50 text-emerald-950 ring-1 ring-inset ring-emerald-200/65',
    Icon:      CheckCircle2,
    iconClass: 'text-emerald-700',
  },
  failed: {
    label:     'Failed',
    pill:
      'border border-red-200 bg-red-50 text-red-900 ring-1 ring-inset ring-red-200/75',
    Icon:      AlertTriangle,
    iconClass: 'text-red-700',
  },
  retrying: {
    label:     'Retrying',
    pill:
      'border border-orange-200 bg-orange-50 text-orange-950 ring-1 ring-inset ring-orange-200/75',
    Icon:      RefreshCw,
    iconClass: 'text-orange-700',
    spin:      true,
  },
};

export function CalendarStatusPill({
  status,
  compact,
  emphasis = 'default',
  className,
}: CalendarStatusPillProps) {
  const s = STATUS_STYLES[status];
  const prominent = emphasis === 'prominent';
  const Icon = s.Icon;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold tracking-tight whitespace-nowrap',
        compact && !prominent ? 'gap-1 px-2 py-[4px] text-[10px]' : null,
        !compact && !prominent && 'px-2.5 py-1 text-[11px]',
        prominent &&
          'px-4 py-2 text-xs shadow-sm sm:gap-2 sm:px-[1.125rem] sm:text-[13px] sm:[&_svg]:size-4',
        s.pill,
        className,
      )}
      title={s.label}
    >
      {Icon ? (
        <Icon
          className={cn(
            'shrink-0',
            compact && !prominent ? 'size-3' : 'size-3.5',
            prominent && 'sm:size-[15px]',
            s.iconClass,
            s.spin && 'animate-spin',
          )}
          aria-hidden
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            compact && !prominent ? 'h-1.5 w-1.5' : 'h-2 w-2',
            'rounded-full bg-current opacity-85',
          )}
        />
      )}
      <span>{s.label}</span>
    </span>
  );
}
