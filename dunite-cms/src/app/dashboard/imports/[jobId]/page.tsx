import { notFound } from 'next/navigation';

import { requireUser } from '@/features/auth/server';
import { getImportJobDetailServerAction } from '@/app/actions/importJobsActions';
import { ImportJobDetailClient } from '@/features/imports/operations/ImportJobDetailClient';

export const dynamic = 'force-dynamic';

export default async function ImportJobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const auth = await requireUser();
  const detail = await getImportJobDetailServerAction(jobId);
  if (!detail.ok) notFound();
  return <ImportJobDetailClient role={auth.role} detail={detail} />;
}
