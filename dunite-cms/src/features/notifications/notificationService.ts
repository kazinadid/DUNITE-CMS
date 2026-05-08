import { supabase } from '@/lib/supabaseClient';

import { NOTIFICATION_SELECT, mapNotificationRow } from './queries';
import type { NotificationListParams, NotificationRow, RawNotificationRow } from './types';

export async function listNotificationsPage(
  params: NotificationListParams,
): Promise<{ rows: NotificationRow[]; total: number }> {
  const pageSize = Math.min(100, Math.max(1, params.pageSize));
  const page     = Math.max(1, params.page);
  const start    = (page - 1) * pageSize;
  const end      = start + pageSize - 1;

  let q = supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end);

  if (!params.includeDismissed) {
    q = q.is('dismissed_at', null);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    rows: ((data ?? []) as RawNotificationRow[]).map(mapNotificationRow),
    total: count ?? 0,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .is('dismissed_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .is('dismissed_at', null);

  if (error) throw error;
}

export async function dismissNotification(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ dismissed_at: now, read_at: now })
    .eq('id', id);

  if (error) throw error;
}

/** Hides every inbox-visible row from the bell (full history remains queryable with `includeDismissed`). */
export async function dismissAllVisibleNotifications(): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ dismissed_at: now, read_at: now })
    .is('dismissed_at', null);

  if (error) throw error;
}
