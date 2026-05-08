import type { PublishingJob } from '@/features/posts/types';

/** Passed to per-channel workers (Graph API, etc.) in a future execution tier. */
export interface PublishingJobExecutionContext {
  job:       PublishingJob;
  postId:    string;
  platform:  string;
  /** Supabase row snapshot version — bump when schema evolves. */
  schemaRev: 1;
}
