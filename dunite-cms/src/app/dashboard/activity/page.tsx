import { requireUser } from '@/features/auth/server';

import { ActivityPageClient } from '@/features/activity';

export const dynamic = 'force-dynamic';

export default async function ActivityRoutePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; entity_type?: string; entity_id?: string }>;
}) {
  const auth = await requireUser();
  const sp    = (await searchParams) ?? {};

  return (
    <ActivityPageClient
      role={auth.role}
      currentUserId={auth.user.id}
      initialSearch={typeof sp.q === 'string' ? sp.q : ''}
      initialEntityType={typeof sp.entity_type === 'string' ? sp.entity_type : undefined}
      initialEntityId={typeof sp.entity_id === 'string' ? sp.entity_id : undefined}
    />
  );
}
