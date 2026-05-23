import 'server-only';

import { fetchDuePublishingJobsForWorker } from '@/lib/publishing/dueJobs';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import { resolveOrgPublishGate } from '@/lib/org/publishGate';
import { publishLinkedInPost, cleanupStaleLinkedInPublishLocks } from './publisher';

const DEFAULT_BATCH = 10;

/**
 * Processes due LinkedIn publishing_jobs rows.
 * Called by cron worker on each tick.
 */
export async function runScheduledLinkedInPublishingTick(): Promise<{
  processed: number;
  errors: string[];
}> {
  const cleaned = await cleanupStaleLinkedInPublishLocks();
  void cleaned;

  const jobs = await fetchDuePublishingJobsForWorker(DEFAULT_BATCH, 'linkedin');

  const admin = createSupabaseAdminClient();
  const errors: string[] = [];
  let processed = 0;

  for (const job of jobs) {
    const postId = job.post_id;
    if (!postId) continue;

    const { data: post } = await admin
      .from('posts')
      .select('user_id, organization_id, social_account_id, publish_locked_at, status')
      .eq('id', postId)
      .maybeSingle();

    if (!post?.social_account_id) {
      errors.push(`post ${postId}: missing social_account_id`);
      continue;
    }

    const gate = await resolveOrgPublishGate(post.user_id as string);
    if (!gate || gate.organizationId !== post.organization_id) {
      errors.push(`post ${postId}: invalid org gate`);
      continue;
    }

    await insertPostPublishActivityLog({
      userId: post.user_id as string,
      postId,
      actionType: 'scheduled_publish_started',
      message: 'Scheduled LinkedIn publish picked up by worker.',
      metadata: {
        organization_id: gate.organizationId,
        publishing_job_id: job.id,
      },
    });

    const { error: markErr } = await admin
      .from('publishing_jobs')
      .update({
        status:     'processing',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .in('status', ['queued', 'retrying']);

    if (markErr) {
      errors.push(`job ${job.id}: ${markErr.message}`);
      continue;
    }

    try {
      await publishLinkedInPost({
        postId,
        socialAccountId: post.social_account_id as string,
        gate,
      });
      processed += 1;

      // Clear scheduled_at after successful publish
      const nowUtc = new Date().toISOString();
      await admin
        .from('posts')
        .update({
          scheduled_at: null,
          updated_at:   nowUtc,
        })
        .eq('id', postId)
        .eq('status', 'published');

      await insertPostPublishActivityLog({
        userId: post.user_id as string,
        postId,
        actionType: 'scheduled_publish_completed',
        message: 'Scheduled LinkedIn publish finished.',
        metadata: {
          organization_id: gate.organizationId,
          publishing_job_id: job.id,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'schedule_publish_failed';
      errors.push(`post ${postId}: ${msg}`);

      await insertPostPublishActivityLog({
        userId: post.user_id as string,
        postId,
        actionType: 'publish_failed',
        message: 'Scheduled LinkedIn publish failed.',
        metadata: {
          organization_id: gate.organizationId,
          publishing_job_id: job.id,
          detail: msg.slice(0, 400),
        },
      });
    }
  }

  return { processed, errors };
}
