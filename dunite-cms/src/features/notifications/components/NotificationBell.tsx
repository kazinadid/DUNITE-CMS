'use client';

import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Loader2,
  OctagonX,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formatAbsolute } from '@/features/posts/lib/relativeTime';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

import {
  dismissAllVisibleNotifications,
  dismissNotification,
  getUnreadNotificationCount,
  listNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
} from '../notificationService';
import type { NotificationRow } from '../types';

const PANEL_LIMIT = 25;

function dayHeading(iso: string) {
  const d     = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function PostLink({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <Link
      href={`/dashboard/posts/${id}/edit`}
      className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#7A0000] hover:underline"
    >
      Open post
      <ChevronRight size={12} aria-hidden />
    </Link>
  );
}

const NotificationRowItem = memo(function NotificationRowItem({
  n,
  onRead,
  onDismiss,
}: {
  n: NotificationRow;
  onRead:    (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const postId =
    typeof n.metadata?.post_id === 'string' ? n.metadata.post_id : undefined;
  const unread = !n.read_at;

  return (
    <li
      className={cn(
        'border-b border-gray-100/90 px-3 py-2.5 transition-colors last:border-0',
        unread ? 'bg-[#7A0000]/[0.04]' : 'bg-white',
      )}
    >
      <div className="flex gap-2">
        <div className="mt-0.5 shrink-0 text-gray-400" aria-hidden>
          {n.type.includes('fail') ? (
            <OctagonX size={15} className="text-red-600" />
          ) : n.type.includes('success') ? (
            <Check size={15} className="text-emerald-600" />
          ) : n.type.includes('retry') ? (
            <RefreshCw size={15} className="text-amber-600" />
          ) : (
            <AlertTriangle size={15} className="text-amber-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-gray-900">{n.title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-gray-600">{n.message}</p>
          <PostLink id={postId} />
          <p className="mt-1 font-mono text-[10px] text-gray-400">
            {formatAbsolute(n.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {unread ? (
            <button
              type="button"
              title="Mark read"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              onClick={() => onRead(n.id)}
            >
              <Check size={14} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            title="Dismiss"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => onDismiss(n.id)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
});

interface NotificationBellProps {
  userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
  const [open, setOpen]     = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows]     = useState<NotificationRow[]>([]);
  const [busy, start]       = useTransition();

  const load = useCallback(async () => {
    const [c, page] = await Promise.all([
      getUnreadNotificationCount(),
      listNotificationsPage({ page: 1, pageSize: PANEL_LIMIT, includeDismissed: false }),
    ]);
    setUnread(c);
    setRows(page.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`notifications-bell:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const badge = useMemo(() => {
    if (unread <= 0) return null;
    const label = unread > 99 ? '99+' : String(unread);
    return (
      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#7A0000] px-[5px] text-[9px] font-bold text-white">
        {label}
      </span>
    );
  }, [unread]);

  const grouped = useMemo(() => {
    const out: { key: string; label: string; items: NotificationRow[] }[] = [];
    for (const n of rows) {
      const label = dayHeading(n.created_at);
      const last  = out[out.length - 1];
      if (last && last.label === label) {
        last.items.push(n);
      } else {
        out.push({ key: `${label}-${n.id}`, label, items: [n] });
      }
    }
    return out;
  }, [rows]);

  const onRead = useCallback(
    (id: string) => {
      start(async () => {
        try {
          await markNotificationRead(id);
          await load();
        } catch {
          /* non-blocking */
        }
      });
    },
    [load],
  );

  const onDismiss = useCallback(
    (id: string) => {
      start(async () => {
        try {
          await dismissNotification(id);
          await load();
        } catch {
          /* non-blocking */
        }
      });
    },
    [load],
  );

  const markAll = useCallback(() => {
    start(async () => {
      try {
        await markAllNotificationsRead();
        await load();
      } catch {
        /* non-blocking */
      }
    });
  }, [load]);

  const clearInbox = useCallback(() => {
    start(async () => {
      try {
        await dismissAllVisibleNotifications();
        await load();
        setOpen(false);
      } catch {
        /* non-blocking */
      }
    });
  }, [load]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <Bell className="size-[1.15rem]" />
        {badge}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl',
              'max-md:fixed max-md:left-3 max-md:right-3 max-md:top-14 max-md:w-auto',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Inbox</p>
              <div className="flex flex-wrap justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={busy}
                  onClick={() => markAll()}
                >
                  <CheckCheck size={12} className="mr-1" />
                  Read all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-[#7A0000]"
                  disabled={busy}
                  onClick={() => clearInbox()}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain">
              {busy && rows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
              ) : (
                <ul>
                  {grouped.map((g) => (
                    <li key={g.key} className="list-none">
                      <div className="bg-gray-50/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {g.label}
                      </div>
                      <ul className="divide-y divide-gray-100/80">
                        {g.items.map((n) => (
                          <NotificationRowItem
                            key={n.id}
                            n={n}
                            onRead={onRead}
                            onDismiss={onDismiss}
                          />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2 text-center">
              <Link
                href="/dashboard/notifications"
                className="text-xs font-semibold text-[#7A0000] hover:underline"
                onClick={() => setOpen(false)}
              >
                Notification center
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
