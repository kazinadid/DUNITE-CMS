import { requireUser } from '@/features/auth/server';

import { NotificationsPageClient } from '@/features/notifications';

export const dynamic = 'force-dynamic';

export default async function NotificationsRoutePage() {
  await requireUser();
  return <NotificationsPageClient />;
}
