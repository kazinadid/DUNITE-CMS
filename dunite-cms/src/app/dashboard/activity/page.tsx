import { requireUser } from '@/features/auth/server';

import { ActivityPageClient } from '@/features/activity';

export const dynamic = 'force-dynamic';

export default async function ActivityRoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const auth = await requireUser();
  const sp    = (await searchParams) ?? {};

  return (
    <ActivityPageClient
      role={auth.role}
      currentUserId={auth.user.id}
      initialSearch={typeof sp.q === 'string' ? sp.q : ''}
    />
  );
}
