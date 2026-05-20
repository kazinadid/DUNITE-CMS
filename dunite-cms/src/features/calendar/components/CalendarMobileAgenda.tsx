'use client';

import { useMemo, type ReactNode } from 'react';

import type { Post } from '@/features/posts';

import {
  formatLocalDateTime,
  localDateKey,
  utcInstantMs,
} from '@/lib/date';

import { CalendarEventCard } from './CalendarEventCard';

function localDayLabel(iso: string): string {
  const key = localDateKey(iso);
  const todayKey = localDateKey(new Date());
  if (key === todayKey) return 'Today';
  const year = key.slice(0, 4);
  const todayYear = todayKey.slice(0, 4);
  return formatLocalDateTime(iso, {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
    year:    year !== todayYear ? 'numeric' : undefined,
    hour:    undefined,
    minute:  undefined,
    hour12:  undefined,
  });
}

/** Local-calendar-day key — stable grouping for agenda headers. */
function localDayKey(iso: string): string {
  return localDateKey(iso);
}

interface CalendarMobileAgendaProps {
  posts:     Post[];
  emptyHint?: ReactNode;
  onOpenPost?: (post: Post) => void;
}

export function CalendarMobileAgenda({
  posts,
  emptyHint,
  onOpenPost,
}: CalendarMobileAgendaProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Post[]>();
    const sorted = [...posts].sort(
      (a, b) =>
        (utcInstantMs(a.scheduled_at) ?? 0) -
        (utcInstantMs(b.scheduled_at) ?? 0),
    );
    for (const p of sorted) {
      if (!p.scheduled_at) continue;
      const key = localDayKey(p.scheduled_at);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort(([ka], [kb]) => ka.localeCompare(kb));
  }, [posts]);

  if (groups.length === 0) {
    return emptyHint ?? null;
  }

  const firstIso = groups[0][1][0]?.scheduled_at ?? '';

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="space-y-8 pb-10">
      {groups.map(([key, items]) => {
        const iso = items[0]?.scheduled_at ?? firstIso;
        return (
          <section key={key} className="space-y-3">
            <h2 className="sticky top-0 z-10 bg-gradient-to-b from-background from-80% to-transparent pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              {localDayLabel(iso)}
            </h2>
            <ul className="space-y-2.5">
              {items.map((p) => (
                <li key={p.id}>
                  <CalendarEventCard post={p} compact onOpen={onOpenPost} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      </div>
    </div>
  );
}
