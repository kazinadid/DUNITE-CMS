'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formatAbsolute } from '@/features/posts/lib/relativeTime';
import { cn } from '@/lib/utils';

import {
  dismissNotification,
  listNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
} from '../notificationService';
import type { NotificationRow } from '../types';

const PAGE_SIZE = 30;

export function NotificationsPageClient() {
  const [page, setPage]     = useState(1);
  const [rows, setRows]     = useState<NotificationRow[]>([]);
  const [total, setTotal]   = useState(0);
  const [pending, start]    = useTransition();

  const fetchPage = useCallback(
    (p: number) => {
      start(async () => {
        try {
          const { rows: r, total: t } = await listNotificationsPage({
            page: p,
            pageSize: PAGE_SIZE,
            includeDismissed: true,
          });
          setRows(r);
          setTotal(t);
        } catch (e) {
          console.error('[notifications]', e);
        }
      });
    },
    [],
  );

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onRead = useCallback(
    (id: string) => {
      start(async () => {
        await markNotificationRead(id);
        fetchPage(page);
      });
    },
    [fetchPage, page],
  );

  const onDismiss = useCallback(
    (id: string) => {
      start(async () => {
        await dismissNotification(id);
        fetchPage(page);
      });
    },
    [fetchPage, page],
  );

  const markAll = useCallback(() => {
    start(async () => {
      await markAllNotificationsRead();
      fetchPage(page);
    });
  }, [fetchPage, page]);

  const critical = useMemo(
    () => rows.filter((r) => r.type.includes('fail') || r.type.includes('failure')),
    [rows],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500">
          Server-generated delivery log — same stream as the header bell, with full archived history.
        </p>
      </header>

      {critical.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Attention · publishing issues on this page</p>
          <ul className="mt-2 list-inside list-disc text-[13px]">
            {critical.slice(0, 5).map((n) => (
              <li key={n.id}>
                {n.title}
                {typeof n.metadata?.post_id === 'string' ? (
                  <>
                    {' '}
                    <Link
                      className="font-semibold underline"
                      href={`/dashboard/posts/${String(n.metadata.post_id)}/edit`}
                    >
                      Open post
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => markAll()}>
          Mark all as read
        </Button>
        <p className="text-xs text-gray-500">
          {total} total · page {page} / {totalPages}
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        {pending && rows.length === 0 ? (
          <div className="flex justify-center py-16 text-gray-500">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between',
                  !n.read_at && 'bg-[#7A0000]/[0.03]',
                )}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{n.title}</p>
                  <p className="text-sm text-gray-600">{n.message}</p>
                  <p className="mt-1 font-mono text-[11px] text-gray-400">
                    {formatAbsolute(n.created_at)} ·{' '}
                    <span className="capitalize text-gray-500">{n.type.replace(/\./g, ' ')}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!n.read_at ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => onRead(n.id)}>
                      Read
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-[#7A0000]"
                    onClick={() => onDismiss(n.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || pending}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={page >= totalPages || pending}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
