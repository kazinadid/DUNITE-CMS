export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'retrying'
  | 'cancelled';

/**
 * Statuses the composer can deliberately write. Transient/system-driven states
 * (`publishing`, `failed`) live only in the database / publish-worker.
 */
export type WritablePostStatus = 'draft' | 'scheduled' | 'queued' | 'published';

export interface PostAuthor {
  id: string;
  name: string | null;
  email: string;
}

export interface PostMedia {
  id: string;
  file_url: string;
  file_type: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  order_index: number;
}

export interface PostPublishEvent {
  id: string;
  created_at: string;
  kind: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

/** Per-platform execution row (Supabase `publishing_jobs`). */
export type PublishingJobStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled';

export interface PublishingJob {
  id:              string;
  /** Present on full table / worker scans; omitted in nested post selects. */
  post_id?:        string;
  platform:        string;
  status:          PublishingJobStatus;
  attempt_count:   number;
  max_attempts:    number;
  scheduled_for:   string;
  started_at:      string | null;
  completed_at:    string | null;
  last_error:      string | null;
  updated_at:      string;
}

export interface PublishingLogEntry {
  id:                string;
  post_id:           string;
  publishing_job_id: string | null;
  platform:          string | null;
  event_type:        string;
  message:           string;
  metadata:          Record<string, unknown> | null;
  created_at:        string;
}

export interface Post {
  id: string;
  user_id: string;
  organization_id: string | null;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  external_post_id: string | null;
  social_account_id: string | null;
  published_by: string | null;
  publish_metadata: Record<string, unknown> | null;
  last_publish_attempt_at: string | null;
  publish_locked_at: string | null;
  publish_locked_by: string | null;
  /** Last backend-reported publish failure message, when known. */
  last_publish_error: string | null;
  /** Number of publish attempts recorded by workers (0 if none). */
  publish_attempt_count: number;
  author: PostAuthor | null;
  platforms: string[];
  media: PostMedia[];
  /** Populated when loaded with `POST_DETAIL_SELECT`; otherwise []. */
  publish_events: PostPublishEvent[];
  /** Per-platform pipeline rows when list/detail select includes `publishing_jobs`. */
  publishing_jobs: PublishingJob[];
  /** Structured infra log; detail select only. */
  publishing_logs: PublishingLogEntry[];
}

export type StatusFilter = 'all' | PostStatus;

/** Shape used by the composer when creating or editing a post. */
export interface PostDraft {
  content: string;
  status: WritablePostStatus;
  scheduled_at: string | null;
  platforms: string[];
}
