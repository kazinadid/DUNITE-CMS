import type { NotificationRow, RawNotificationRow } from './types';

export const NOTIFICATION_SELECT = `
  id,
  user_id,
  type,
  title,
  message,
  metadata,
  read_at,
  dismissed_at,
  created_at
` as const;

export function mapNotificationRow(r: RawNotificationRow): NotificationRow {
  return {
    id:           r.id,
    user_id:      r.user_id,
    type:         r.type as NotificationRow['type'],
    title:        r.title,
    message:      r.message,
    metadata:     r.metadata ?? null,
    read_at:      r.read_at,
    dismissed_at: r.dismissed_at,
    created_at:   r.created_at,
  };
}
