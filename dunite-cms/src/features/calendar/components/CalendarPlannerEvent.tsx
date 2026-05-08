'use client';

import type { CSSProperties } from 'react';

import type { EventContentArg } from '@fullcalendar/core';

import { PlatformIcon } from '@/features/composer';
import type { PlatformId } from '@/features/composer/types';
import type { Post } from '@/features/posts';

import {
  CALENDAR_PLATFORM_CHROME,
  CALENDAR_PLATFORM_DOT,
  gradientStops,
} from '@/features/calendar/lib/platformAccent';
import { postContentPreview } from '@/features/calendar/lib/toCalendarEvents';
import { cn } from '@/lib/utils';

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

function previewLines(viewType?: string): { maxChars: number; lineClampClass: string } {
  const vt = viewType ?? '';
  if (vt.includes('dayGrid')) return { maxChars: 92, lineClampClass: 'line-clamp-2' };
  if (vt.includes('timeGridWeek')) return { maxChars: 260, lineClampClass: 'line-clamp-5' };
  return { maxChars: 440, lineClampClass: 'line-clamp-6' };
}

function leftAccent(platformsParsed: PlatformId[]): CSSProperties {
  const stops = gradientStops(platformsParsed);
  const igSingle =
    platformsParsed.length === 1 && platformsParsed[0] === 'instagram';
  if (igSingle) {
    return {
      borderLeftWidth:     3,
      borderLeftStyle:     'solid',
      borderLeftColor:     '#c026d3',
    };
  }
  if (platformsParsed.length >= 2) {
    const a = CALENDAR_PLATFORM_DOT[platformsParsed[0]] ?? '#6b7280';
    const b =
      CALENDAR_PLATFORM_DOT[platformsParsed[1]] ??
      CALENDAR_PLATFORM_DOT[platformsParsed[0]] ??
      '#6b7280';
    return {
      borderLeftWidth: 3,
      borderLeftStyle: 'solid',
      borderLeftColor: 'transparent',
      borderImageSource: `linear-gradient(180deg, ${a}, ${b})`,
      borderImageSlice:  1,
    };
  }
  const stripe = stops[0] ?? '#7a0000';
  return {
    borderLeftWidth:     3,
    borderLeftStyle:     'solid',
    borderLeftColor:     stripe,
  };
}

/** Rich planner tile rendered inside FullCalendar event slots (month / week / day). */
export function CalendarPlannerEvent({ arg }: CalendarPlannerEventProps) {
  const post = arg.event.extendedProps.post as Post;
  const flat =
    post.content.replace(/\s+/g, ' ').trim() || postContentPreview(post.content);

  const { maxChars, lineClampClass } = previewLines(arg.view?.type);

  const preview =
    flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1)}…`;

  const platformsParsed = post.platforms
    .map(parsePlatform)
    .filter((p): p is PlatformId => Boolean(p));

  const defaultChrome =
    'bg-muted/90 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] ring-1 ring-border';

  const accentStyle = platformsParsed.length
    ? leftAccent(platformsParsed)
    : { borderLeftWidth: 3, borderLeftStyle: 'solid' as const, borderLeftColor: '#737373' };

  return (
    <div className="calendar-planner-event w-full px-px py-[2px]">
      <div
        style={accentStyle}
        className={cn(
          'planner-event-face rounded-[11px] border border-zinc-200/90 bg-gradient-to-br from-white/99 via-white/97 to-white/92 pl-3 pr-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)] transition-[transform,box-shadow,border-color] duration-200 ease-out will-change-transform',
          'ring-1 shadow-zinc-900/13 ring-black/[0.04]',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 font-mono text-[11px] font-bold tracking-tight text-zinc-800 tabular-nums">
            {arg.timeText}
          </span>
          <CalendarStatusPill status={post.status} compact />
        </div>

        {platformsParsed.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {platformsParsed.map((pid) => (
              <span
                key={pid}
                title={pid}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center rounded-lg p-[5px]',
                  CALENDAR_PLATFORM_CHROME[pid] ?? defaultChrome,
                )}
              >
                <PlatformIcon platform={pid} size={13} className="shrink-0 opacity-[0.96]" />
              </span>
            ))}
          </div>
        ) : null}

        <p
          className={cn(
            'mt-2 text-[13px] leading-snug font-semibold tracking-[-0.015em] text-zinc-800',
            lineClampClass,
          )}
        >
          {preview}
        </p>
      </div>
    </div>
  );
}
