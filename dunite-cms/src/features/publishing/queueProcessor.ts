import type { PublishingJob } from '@/features/posts/types';

import type { PublishingWorker } from './worker';

export interface QueueProcessorOptions {
  /** Max jobs per tick — capped upstream by RPC (200). */
  batchSize: number;
  worker:    PublishingWorker;
}

type DueJobRow = PublishingJob & { post_id: string };

/**
 * Orchestration shell for a future distributed worker: fetch due rows, fan out,
 * isolate per-job errors. Real network publishing plugs in via `PublishingWorker`.
 */
export async function createQueueProcessorTick(
  fetchDue: (limit: number) => Promise<DueJobRow[]>,
  options: QueueProcessorOptions,
): Promise<{ processed: number; errors: { jobId: string; message: string }[] }> {
  const jobs = await fetchDue(options.batchSize);
  const errors: { jobId: string; message: string }[] = [];
  let processed = 0;

  for (const job of jobs) {
    try {
      await options.worker({
        job,
        postId:   job.post_id,
        platform: job.platform,
        schemaRev: 1,
      });
      processed += 1;
    } catch (e: unknown) {
      errors.push({
        jobId:   job.id,
        message: e instanceof Error ? e.message : 'unknown error',
      });
    }
  }

  return { processed, errors };
}
