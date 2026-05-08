'use client';

import type { EventContentArg } from '@fullcalendar/core';

import { PlatformIcon } from '@/features/composer';
import type { PlatformId } from '@/features/composer/types';
import type { Post } from '@/features/posts';
import { cn } from '@/lib/utils';

import { CALENDAR_PLATFORM_CHROME } from '@/features/calendar/lib/platformAccent';
import { formatCalendarSlotTime } from '@/features/calendar/lib/formatTime';
import { CalendarStatusPill } from './CalendarStatusPill';

interface CalendarPlannerEventProps {
  arg: EventContentArg;
}

function parsePlatform(raw: string): PlatformId | null {
  const p = raw.toLowerCase().trim();
  if (p === 'facebook' || p === 'instagram' || p === 'linkedin' || p === 'twitter') {
    return p;
  }
  return null;
}

const defaultChrome =
  'bg-muted/90 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] ring-1 ring-border';

/** FullCalendar renders this as `.fc-event`; keep stable layout for drag + multi-day stripes. */
export function CalendarPlannerEvent({ arg }: CalendarPlannerEventProps) {
  const post = arg.event.extendedProps.post as Post;
  const viewType = arg.view.type;
  const compact = viewType === 'timeGridWeek' || viewType === 'timeGridDay';
  const platformsParsed = post.platforms.map(parsePlatform).filter((p): p is PlatformId => Boolean(p));
  const maxVisible = compact ? 2 : 4;
  const hidden = platformsParsed.length - maxVisible;
  const timeLine = post.scheduled_at ? formatCalendarSlotTime(post.scheduled_at) : '';

  const title = `${timeLine ? `${timeLine} · ` : ''}${post.content?.slice(0, 80) ?? 'Post'}${(post.content?.length ?? 0) > 80 ? '…' : ''}`;

  const jobs = post.publishing_jobs ?? [];
  const jobPipelineIssue = jobs.some((j) => j.status === 'failed' || j.status === 'retrying');

  return (
    <div
      className={cn(
        'planner-event-face relative h-full overflow-hidden rounded-[10px] border border-border/70 bg-gradient-to-br from-card/98 via-card/95 to-muted/25 px-2 py-1.5 shadow-[0_6px_18px_-10px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.88)] transition-[transform,box-shadow] duration-200 ease-out',
        compact && 'rounded-[8px] px-1.5 py-1',
        jobPipelineIssue &&
          'border-red-300/70 ring-1 ring-red-400/25 shadow-[0_6px_20px_-10px_rgba(127,29,29,0.35)]',
      )}
    >
      <div className="flex min-h-0 flex-col gap-1">
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate font-semibold tabular-nums text-[11px] text-neutral-900',
                compact && 'text-[10px]',
              )}
            >
              {timeLine}
            </span>
          </div>
          <CalendarStatusPill status={post.status} compact />
        </div>

        <p
          className={cn(
            'line-clamp-2 min-h-0 text-[11px] leading-snug text-neutral-800',
            compact && 'line-clamp-1 text-[10px]',
          )}
          title={title}
        >
          {post.content?.trim() || 'Untitled post'}
        </p>

        {platformsParsed.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {platformsParsed.slice(0, maxVisible).map((pid) => (
              <span
                key={pid}
                className={cn(
                  'inline-flex max-w-full items-center gap-0.5 rounded-full px-1.5 py-[2px] text-[9px] font-semibold tracking-tight ring-1 ring-inset',
                  CALENDAR_PLATFORM_CHROME[pid] ?? defaultChrome,
                )}
                title={pid}
              >
                <PlatformIcon platform={pid} size={10} />
              </span>
            ))}
            {hidden > 0 ? (
              <span className="text-[9px] font-semibold text-neutral-500">+{hidden}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
