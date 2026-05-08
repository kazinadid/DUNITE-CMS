'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';

import { PlatformIcon } from '@/features/composer';
import type { PlatformId } from '@/features/composer/types';
import {
  CALENDAR_PLATFORM_CHROME,
  CALENDAR_PLATFORM_DOT,
  gradientStops,
} from '@/features/calendar/lib/platformAccent';
import type { Post } from '@/features/posts';
import { formatAbsolute } from '@/features/posts';
import { cn } from '@/lib/utils';

import { CalendarStatusPill } from './CalendarStatusPill';

interface CalendarEventCardProps {
  post:      Post;
  compact?: boolean;
  className?: string;
}

function parsePlatform(raw: string): PlatformId | null {
  const p = raw.toLowerCase().trim();
  if (p === 'facebook' || p === 'instagram' || p === 'linkedin' || p === 'twitter') {
    return p;
  }
  return null;
}

function leftBorderStyle(platforms: PlatformId[]): CSSProperties {
  if (platforms.length === 0) {
    return { borderLeftColor: '#a1a1aa' };
  }
  if (platforms.length === 1 && platforms[0] === 'instagram') {
    return { borderLeftColor: '#c026d3' };
  }
  if (platforms.length >= 2) {
    const a = CALENDAR_PLATFORM_DOT[platforms[0]] ?? '#6b7280';
    const b =
      CALENDAR_PLATFORM_DOT[platforms[1]] ??
      CALENDAR_PLATFORM_DOT[platforms[0]] ??
      '#6b7280';
    return {
      borderLeftColor:     'transparent',
      borderImageSource:   `linear-gradient(180deg, ${a}, ${b})`,
      borderImageSlice:    1,
    };
  }
  const [first] = gradientStops(platforms);
  return { borderLeftColor: first };
}

/**
 * Mobile agenda row — matches the in-calendar planner card language (icons, status, accent).
 */
export function CalendarEventCard({
  post,
  compact,
  className,
}: CalendarEventCardProps) {
  const at = post.scheduled_at ?? post.created_at;
  const preview = post.content.replace(/\s+/g, ' ').trim() || 'Scheduled post';
  const clipLen = compact ? 100 : 160;
  const body =
    preview.length <= clipLen ? preview : `${preview.slice(0, clipLen - 1)}…`;

  const platformsParsed = post.platforms
    .map(parsePlatform)
    .filter((p): p is PlatformId => Boolean(p));

  const defaultChrome =
    'bg-muted/90 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] ring-1 ring-border';

  return (
    <Link
      href={`/dashboard/posts/${post.id}/edit`}
      className={cn(
        'group/agenda block max-w-full overflow-hidden rounded-[14px] border border-zinc-200/90 bg-gradient-to-br from-white/99 via-white/97 to-white/92 shadow-[0_8px_28px_-16px_rgba(15,23,42,0.28)] transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'ring-1 ring-black/[0.04] hover:-translate-y-px hover:border-zinc-300/95 hover:shadow-[0_16px_40px_-24px_rgba(15,23,42,0.35)] active:translate-y-0',
        className,
      )}
      style={{
        borderLeftWidth:    4,
        borderLeftStyle:    'solid',
        ...leftBorderStyle(platformsParsed),
      }}
    >
      <div className={cn('p-3.5 pr-4', compact && 'p-3')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <time
            dateTime={post.scheduled_at ?? undefined}
            className="min-w-0 font-mono text-xs font-bold tabular-nums text-zinc-900"
          >
            {formatAbsolute(at)}
          </time>
          <CalendarStatusPill status={post.status} compact />
        </div>

        {platformsParsed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {platformsParsed.map((pid) => (
              <span
                key={pid}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg p-1 transition-transform duration-150 group-hover/agenda:scale-[1.04]',
                  CALENDAR_PLATFORM_CHROME[pid] ?? defaultChrome,
                )}
              >
                <PlatformIcon platform={pid} size={compact ? 12 : 14} />
              </span>
            ))}
          </div>
        )}

        <p
          className={cn(
            'mt-3 text-sm font-semibold leading-relaxed tracking-[-0.012em] text-zinc-800',
            compact ? 'line-clamp-3 text-[13px]' : 'line-clamp-4 text-[14px]',
          )}
        >
          {body}
        </p>

        <span className="mt-3.5 block text-[11px] font-semibold text-zinc-500 transition-colors group-hover/agenda:text-[#7A0000]">
          Open in editor →
        </span>
      </div>
    </Link>
  );
}
