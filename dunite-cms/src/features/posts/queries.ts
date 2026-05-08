// ============================================================================
//  Shared post-query primitives
// ----------------------------------------------------------------------------
//  These don't import any supabase client, so they're safe to use from both
//  Server Components (RSCs) and Client Components.  The select string and
//  row-mapper are the single source of truth for what a `Post` looks like
//  end-to-end.
// ============================================================================

import type { Post, PostPublishEvent, PostStatus } from './types';

/**
 * Always read author + platforms + media so the UI can render a fully-formed
 * card without round-trips. RLS on `posts` / `post_platforms` / `media` is the
 * security boundary; this select is just the shape we want back.
 */
export const POST_LIST_SELECT = `
  id, user_id, content, status, scheduled_at, published_at, created_at, updated_at,
  last_publish_error, publish_attempt_count, failure_sort_key,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform ),
  media ( id, file_url, file_type, file_name, mime_type, storage_path, order_index )
` as const;

/** Detail view + publish telemetry log (timeline). */
export const POST_DETAIL_SELECT = `
  ${POST_LIST_SELECT.trim()},
  post_publish_events ( id, created_at, kind, message )
` as const;

/** @deprecated Prefer POST_LIST_SELECT or POST_DETAIL_SELECT for clarity */
export const POST_SELECT = POST_LIST_SELECT;

export interface RawPostRow {
  id: string;
  user_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
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

export function mapPostRow(row: RawPostRow): Post {
  const eventsRaw = row.post_publish_events ?? [];
  const publish_events: PostPublishEvent[] = [...eventsRaw]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map(mapPublishEvent);

  return {
    id:                     row.id,
    user_id:                row.user_id,
    content:                row.content,
    status:                 row.status,
    scheduled_at:           row.scheduled_at,
    published_at:           row.published_at,
    created_at:             row.created_at,
    updated_at:             row.updated_at,
    last_publish_error:     row.last_publish_error ?? null,
    publish_attempt_count:  row.publish_attempt_count ?? 0,
    author:                 row.author,
    platforms:              (row.post_platforms ?? []).map((p) => p.platform),
    publish_events,
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
