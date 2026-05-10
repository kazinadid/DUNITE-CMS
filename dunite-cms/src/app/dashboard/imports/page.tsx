import { requireWriter } from '@/features/auth/server';
import { ImportsPageClient } from '@/features/imports';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const auth = await requireWriter();

  return <ImportsPageClient role={auth.role} />;
}
