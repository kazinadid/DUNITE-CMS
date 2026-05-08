'use client';

import { AlertTriangle, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { retryPublishingJob } from '@/features/posts/services/postsService';

import { listNotificationsPage } from '../notificationService';
import type { NotificationRow } from '../types';

const WIDGET_N = 6;

function jobIdFromMeta(meta: Record<string, unknown> | null): string | undefined {
  const v = meta?.publishing_job_id;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function RecentNotificationsWidget() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [pending, start] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(() => {
    start(async () => {
      try {
        const { rows: r } = await listNotificationsPage({
          page: 1,
          pageSize: WIDGET_N,
          includeDismissed: false,
        });
        setRows(r);
      } catch {
        setRows([]);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failures = rows.filter((r) => r.type.includes('fail') || r.type.includes('failure'));

  const onRetryJob = useCallback(
    (jobId: string) => {
      setRetryingId(jobId);
      start(async () => {
        try {
          await retryPublishingJob(jobId);
          toast.success('Retry queued', { description: 'The publishing job was re-queued with backoff.' });
          load();
        } catch (e: unknown) {
          toast.error('Retry failed', {
            description: e instanceof Error ? e.message : 'Check permissions or try from Posts.',
          });
        } finally {
          setRetryingId(null);
        }
      });
    },
    [load],
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-black/[0.02]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          <p className="mt-0.5 text-xs text-gray-500">Latest inbox items · realtime-ready</p>
        </div>
        <Link
          href="/dashboard/notifications"
          className="text-xs font-semibold text-[#7A0000] hover:underline"
        >
          All
        </Link>
      </div>

      {failures.length > 0 && (
        <div className="mb-3 flex gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-900">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>{failures.length} publishing alert(s) — review in the notification center.</span>
        </div>
      )}

      {pending && rows.length === 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
          No new notifications.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const jid = jobIdFromMeta(n.metadata);
            const canRetry = (n.type === 'retry_failed' || n.type === 'publish_failure') && jid;
            return (
              <li key={n.id}>
                <div className="flex items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 transition hover:border-gray-200 hover:bg-gray-50/80">
                  <Link
                    href="/dashboard/notifications"
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium text-gray-900">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-gray-500">{n.message}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    {canRetry ? (
                      <button
                        type="button"
                        title="Retry publish job"
                        disabled={retryingId === jid}
                          onClick={(e) => {
                          e.preventDefault();
                          onRetryJob(jid);
                        }}
                        className="inline-flex items-center gap-0.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-[#7A0000] ring-1 ring-[#7A0000]/25 transition hover:bg-[#7A0000]/5 disabled:opacity-50"
                      >
                        {retryingId === jid ? (
                          <Loader2 size={10} className="animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw size={10} aria-hidden />
                        )}
                        Retry
                      </button>
                    ) : null}
                    <Link
                      href="/dashboard/notifications"
                      className="inline-flex p-1 text-gray-300 hover:text-gray-500"
                      aria-label="Open notifications"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
