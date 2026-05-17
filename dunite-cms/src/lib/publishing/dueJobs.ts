import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

import type { PublishingJob } from '@/features/posts/types';

/** One `publishing_jobs` row as returned by `list_due_publishing_jobs` (includes `post_id`). */
export type DuePublishingJobRow = PublishingJob & { post_id: string };

/** Rows ready for worker execution (`list_due_publishing_jobs`). Service-role only. */
export async function fetchDuePublishingJobsForWorker(
  limit = 50,
  platform: string | null = null,
): Promise<DuePublishingJobRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('list_due_publishing_jobs', {
    p_limit: limit,
    p_platform: platform,
  });
  if (error) throw error;
  return (data ?? []) as DuePublishingJobRow[];
}
