'use client';

import { NotificationBell } from './NotificationBell';
import { useNotificationToasts } from '../useNotificationToasts';

export function DashboardNotificationHost({ userId }: { userId: string }) {
  useNotificationToasts(userId);
  return <NotificationBell userId={userId} />;
}
