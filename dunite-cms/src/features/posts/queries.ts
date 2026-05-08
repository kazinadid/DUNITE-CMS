// ============================================================================
//  Shared post-query primitives
// ----------------------------------------------------------------------------
//  These don't import any supabase client, so they're safe to use from both
//  Server Components (RSCs) and Client Components.  The select string and
//  row-mapper are the single source of truth for what a `Post` looks like
//  end-to-end.
// ============================================================================

import type { Post, PostStatus } from './types';

/**
 * Always read author + platforms + media so the UI can render a fully-formed
 * card without round-trips. RLS on `posts` / `post_platforms` / `media` is the
 * security boundary; this select is just the shape we want back.
 */
export const POST_SELECT = `
  id, user_id, content, status, scheduled_at, published_at, created_at, updated_at,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform ),
  media ( id, file_url, file_type, file_name, mime_type, storage_path )
` as const;

export interface RawPostRow {
  id: string;
  user_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
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
      }[]
    | null;
}

export function mapPostRow(row: RawPostRow): Post {
  return {
    id:           row.id,
    user_id:      row.user_id,
    content:      row.content,
    status:       row.status,
    scheduled_at: row.scheduled_at,
    published_at: row.published_at,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
    author:       row.author,
    platforms:    (row.post_platforms ?? []).map((p) => p.platform),
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
      })),
  };
}
