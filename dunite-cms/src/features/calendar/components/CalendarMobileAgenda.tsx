'use client';

import { useMemo, type ReactNode } from 'react';

import type { Post } from '@/features/posts';

import { CalendarEventCard } from './CalendarEventCard';

function localDayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isSame =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isSame) return 'Today';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
    year:    d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/** Local-calendar-day key — stable grouping for agenda headers. */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

interface CalendarMobileAgendaProps {
  posts: Post[];
  emptyHint?: ReactNode;
}

export function CalendarMobileAgenda({ posts, emptyHint }: CalendarMobileAgendaProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Post[]>();
    const sorted = [...posts].sort(
      (a, b) =>
        new Date(a.scheduled_at ?? '').getTime() -
        new Date(b.scheduled_at ?? '').getTime(),
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
                  <CalendarEventCard post={p} compact />
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
