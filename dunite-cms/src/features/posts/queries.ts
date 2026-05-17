// ============================================================================
//  Shared post-query primitives
// ----------------------------------------------------------------------------
//  These don't import any supabase client, so they're safe to use from both
//  Server Components (RSCs) and Client Components.  The select string and
//  row-mapper are the single source of truth for what a `Post` looks like
//  end-to-end.
// ============================================================================

import type {
  Post,
  PostPublishEvent,
  PostStatus,
  PublishingJob,
  PublishingJobStatus,
  PublishingLogEntry,
} from './types';

/**
 * Always read author + platforms + media so the UI can render a fully-formed
 * card without round-trips. RLS on `posts` / `post_platforms` / `media` is the
 * security boundary; this select is just the shape we want back.
 */
export const POST_LIST_SELECT = `
  id, user_id, organization_id, content, status, scheduled_at, published_at, created_at, updated_at,
  external_post_id, social_account_id, published_by, publish_metadata, last_publish_attempt_at,
  publish_locked_at, publish_locked_by,
  last_publish_error, publish_attempt_count, failure_sort_key,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform ),
  media ( id, file_url, file_type, file_name, mime_type, storage_path, order_index ),
  publishing_jobs (
    id, platform, status, attempt_count, max_attempts, scheduled_for,
    started_at, completed_at, last_error, updated_at
  )
` as const;

/** Detail view + publish telemetry log (timeline) + structured publishing logs. */
export const POST_DETAIL_SELECT = `
  ${POST_LIST_SELECT.trim()},
  post_publish_events ( id, created_at, kind, message ),
  publishing_logs (
    id, post_id, publishing_job_id, platform, event_type, message, metadata, created_at
  )
` as const;

/** @deprecated Prefer POST_LIST_SELECT or POST_DETAIL_SELECT for clarity */
export const POST_SELECT = POST_LIST_SELECT;

export interface RawPostRow {
  id: string;
  user_id: string;
  organization_id?: string | null;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  external_post_id?: string | null;
  social_account_id?: string | null;
  published_by?: string | null;
  publish_metadata?: Record<string, unknown> | null;
  last_publish_attempt_at?: string | null;
  publish_locked_at?: string | null;
  publish_locked_by?: string | null;
  /** Present after migration `0005_posts_publish_audit`; missing on stale caches. */
  last_publish_error?: string | null;
  publish_attempt_count?: number | null;
  failure_sort_key?: number | null;
  author: { id: string; name: string | null; email: string } | null;
  post_platforms: { platform: string }[] | null;
  media:
    | {
        id: string;
        file_url: string | null;
        file_type: string | null;
        file_name: string | null;
        mime_type: string | null;
        storage_path: string | null;
        order_index: number | null;
      }[]
    | null;
  post_publish_events?:
    | {
        id: string;
        created_at: string;
        kind: string;
        message: string;
      }[]
    | null;
  publishing_jobs?:
    | {
        id: string;
        platform: string;
        status: string;
        attempt_count: number | null;
        max_attempts: number | null;
        scheduled_for: string;
        started_at: string | null;
        completed_at: string | null;
        last_error: string | null;
        updated_at: string;
      }[]
    | null;
  publishing_logs?:
    | {
        id: string;
        post_id: string;
        publishing_job_id: string | null;
        platform: string | null;
        event_type: string;
        message: string;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }[]
    | null;
}

function mapPublishEvent(raw: NonNullable<RawPostRow['post_publish_events']>[number]): PostPublishEvent {
  const kind = raw.kind as PostPublishEvent['kind'];
  const safeKind: PostPublishEvent['kind'] =
    kind === 'info' || kind === 'warn' || kind === 'error' || kind === 'success'
      ? kind
      : 'info';
  return {
    id:         raw.id,
    created_at: raw.created_at,
    kind:       safeKind,
    message:    raw.message,
  };
}

const JOB_STATUS_SET = new Set<string>([
  'queued',
  'processing',
  'succeeded',
  'failed',
  'retrying',
  'cancelled',
]);

function mapPublishingJob(
  raw: NonNullable<RawPostRow['publishing_jobs']>[number],
): PublishingJob {
  const st     = raw.status;
  const status = JOB_STATUS_SET.has(st)
    ? (st as PublishingJobStatus)
    : 'queued';
  return {
    id:              raw.id,
    platform:        raw.platform,
    status,
    attempt_count:   raw.attempt_count ?? 0,
    max_attempts:    raw.max_attempts ?? 5,
    scheduled_for:   raw.scheduled_for,
    started_at:      raw.started_at,
    completed_at:    raw.completed_at,
    last_error:      raw.last_error,
    updated_at:      raw.updated_at,
  };
}

function mapPublishingLog(
  raw: NonNullable<RawPostRow['publishing_logs']>[number],
): PublishingLogEntry {
  return {
    id:                raw.id,
    post_id:           raw.post_id,
    publishing_job_id: raw.publishing_job_id,
    platform:          raw.platform,
    event_type:        raw.event_type,
    message:           raw.message,
    metadata:          raw.metadata ?? null,
    created_at:        raw.created_at,
  };
}

export function mapPostRow(row: RawPostRow): Post {
  const eventsRaw = row.post_publish_events ?? [];
  const publish_events: PostPublishEvent[] = [...eventsRaw]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(mapPublishEvent);

  const publishing_jobs: PublishingJob[] = (row.publishing_jobs ?? []).map(mapPublishingJob);

  const publishing_logs: PublishingLogEntry[] = [...(row.publishing_logs ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(mapPublishingLog);

  return {
    id:                     row.id,
    user_id:                row.user_id,
    organization_id:        row.organization_id ?? null,
    content:                row.content,
    status:                 row.status,
    scheduled_at:           row.scheduled_at,
    published_at:           row.published_at,
    created_at:             row.created_at,
    updated_at:             row.updated_at,
    external_post_id:       row.external_post_id ?? null,
    social_account_id:      row.social_account_id ?? null,
    published_by:           row.published_by ?? null,
    publish_metadata:       row.publish_metadata ?? null,
    last_publish_attempt_at: row.last_publish_attempt_at ?? null,
    publish_locked_at:      row.publish_locked_at ?? null,
    publish_locked_by:      row.publish_locked_by ?? null,
    last_publish_error:     row.last_publish_error ?? null,
    publish_attempt_count:  row.publish_attempt_count ?? 0,
    author:                 row.author,
    platforms:              (row.post_platforms ?? []).map((p) => p.platform),
    publish_events,
    publishing_jobs,
    publishing_logs,
    media: (row.media ?? [])
      // Drop legacy/incomplete rows where the upload never wrote a URL.
      .filter((m) => Boolean(m.file_url))
      .map((m) => ({
        id:           m.id,
        file_url:     m.file_url ?? '',
        file_type:    m.file_type ?? 'unknown',
        file_name:    m.file_name ?? '',
        mime_type:    m.mime_type ?? '',
        storage_path: m.storage_path ?? '',
        order_index: m.order_index ?? 0,
      }))
      .sort((a, b) => a.order_index - b.order_index),
  };
}
