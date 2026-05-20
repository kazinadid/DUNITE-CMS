'use client';

import { memo, useMemo } from 'react';

import { formatLocalDateTime, localDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

import { ActivityEntryCard } from './ActivityEntryCard';
import type { ActivityLog } from '../types';

function dayKey(iso: string) {
  return localDateKey(iso);
}

function dayHeading(iso: string) {
  const ds = localDateKey(iso);
  const today = new Date();
  const yday = new Date(today);
  yday.setDate(yday.getDate() - 1);
  const ts = localDateKey(today);
  const ys = localDateKey(yday);
  if (ds === ts) return 'Today';
  if (ds === ys) return 'Yesterday';
  return formatLocalDateTime(iso, {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
    year:    ds.slice(0, 4) !== ts.slice(0, 4) ? 'numeric' : undefined,
    hour:    undefined,
    minute:  undefined,
    hour12:  undefined,
  });
}

export interface ActivityTimelineProps {
  entries:   ActivityLog[];
  compact?:  boolean;
  className?: string;
}

function ActivityTimelineImpl({ entries, compact, className }: ActivityTimelineProps) {
  const groups = useMemo(() => {
    const map = new Map<string, ActivityLog[]>();
    for (const e of entries) {
      const k = dayKey(e.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-8 text-center text-sm text-gray-500">
        No activity recorded yet. Actions will appear here after you create or change content.
      </p>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {groups.map(([key, items]) => (
        <section key={key} className="space-y-3">
          <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-gradient-to-b from-white via-white/95 to-transparent px-1 pb-1 pt-0.5">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
              {dayHeading(items[0]!.created_at)}
            </h3>
            <span className="font-mono text-[10px] text-gray-300">{key}</span>
            <span className="ml-auto text-[10px] text-gray-400">
              {items.length} event{items.length === 1 ? '' : 's'}
            </span>
          </div>
          <ol className="relative space-y-2 border-l border-gray-200/80 pl-4">
            {items.map((e) => (
              <li key={e.id} className="relative">
                <span
                  className="absolute -left-[5px] top-4 h-2 w-2 rounded-full bg-[#7A0000]/35 ring-2 ring-white"
                  aria-hidden
                />
                <ActivityEntryCard entry={e} compact={compact} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export const ActivityTimeline = memo(ActivityTimelineImpl);
