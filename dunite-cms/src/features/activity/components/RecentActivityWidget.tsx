'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { listActivityPage } from '../activityService';
import { filterConcisePublishing } from '../activityFeedFilter';
import type { ActivityLog } from '../types';
import { ActivityEntryCard } from './ActivityEntryCard';

const WIDGET_SIZE = 8;

interface RecentActivityWidgetProps {
  /** Prefer concise feed in dashboard chrome */
  concisePublishing?: boolean;
}

export function RecentActivityWidget({
  concisePublishing = true,
}: RecentActivityWidgetProps) {
  const [rows, setRows]     = useState<ActivityLog[]>([]);
  const [total, setTotal]   = useState(0);
  const [pending, start]   = useTransition();

  const load = useCallback(() => {
    start(() => {
      void (async () => {
        try {
          const { entries: raw, total: t } = await listActivityPage({
            page: 1,
            pageSize: concisePublishing ? 32 : WIDGET_SIZE,
          });
          const entries =
            concisePublishing ? filterConcisePublishing(raw).slice(0, WIDGET_SIZE) : raw.slice(0, WIDGET_SIZE);
          setRows(entries);
          setTotal(t);
        } catch {
          setRows([]);
        }
      })();
    });
  }, [concisePublishing]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFailed = useMemo(
    () =>
      rows.some(
        (r) =>
          r.action_type.toLowerCase().includes('failed') ||
          r.message.toLowerCase().includes('fail'),
      ),
    [rows],
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Recent activity</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Live audit stream · {total > 0 ? `${total}+ events` : 'No events yet'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={pending} onClick={load}>
            Refresh
          </Button>
          <Button size="sm" className="h-8 bg-[#7A0000] text-xs text-white hover:bg-[#5A0000]" asChild>
            <Link href="/dashboard/activity">View all</Link>
          </Button>
        </div>
      </div>

      {hasFailed && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-900">
          Attention: recent failures detected in the audit stream.{' '}
          <Link href="/dashboard/activity?q=fail" className="font-semibold underline">
            Open filtered view
          </Link>
        </div>
      )}

      {pending && rows.length === 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="h-[4.5rem] animate-pulse rounded-xl bg-gray-100/90"
            />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-6 text-center text-sm text-gray-500">
          Workspace activity will surface here as teammates create and ship content.
        </p>
      ) : (
        <ul className="max-h-[min(520px,62vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
          {rows.map((e) => (
            <li key={e.id}>
              <ActivityEntryCard entry={e} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
