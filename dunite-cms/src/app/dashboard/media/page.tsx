import { Suspense } from 'react';

import { MediaLibraryPageClient } from '@/features/media-library';
import { requireUser } from '@/features/auth/server';

import MediaPageLoading from '@/app/dashboard/media/loading';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const auth = await requireUser();
  return (
    <Suspense fallback={<MediaPageLoading />}>
      <MediaLibraryPageClient userId={auth.user.id} role={auth.role} />
    </Suspense>
  );
}
