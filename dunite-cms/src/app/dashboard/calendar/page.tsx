import { CalendarPageClient } from './CalendarPageClient';
import { requireUser } from '@/features/auth/server';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const auth = await requireUser();
  return <CalendarPageClient role={auth.role} />;
}
