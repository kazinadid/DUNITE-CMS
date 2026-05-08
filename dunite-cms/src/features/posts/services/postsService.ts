import { supabase } from '@/lib/supabaseClient';

import {
  POST_DETAIL_SELECT,
  POST_SELECT,
  mapPostRow,
  type RawPostRow,
} from '../queries';
import type { Post } from '../types';
import type { StatusFilter } from '../types';

// ── List / paging ─────────────────────────────────────────────────────────────

/**
 * Rebuild per-platform `publishing_jobs` from `posts` + `post_platforms`.
 * Idempotent — invokes Supabase RPC `replace_publishing_jobs`.
 */
export async function syncPublishingPipeline(postId: string): Promise<void> {
  const { error } = await supabase.rpc('replace_publishing_jobs', { p_post_id: postId });
  if (error) console.warn('[posts] syncPublishingPipeline:', error.message);
}

/** Surface retry for a failed job row (exponential backoff inside RPC). */
export async function retryPublishingJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('retry_publishing_job', { p_job_id: jobId });
  if (error) throw error;
}

/** Refetch list-shaped post (platforms + `publishing_jobs`) after pipeline RPC mutates job rows. */
async function refetchPostListShape(id: string): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;
  return mapPostRow(data as unknown as RawPostRow);
}

export type PostSortOption =
  | 'newest'
  | 'oldest'
  | 'scheduled_soon'
  | 'failed_first';

export interface ListPostsPageParams {
  page:         number;
  pageSize:     number;
  status:       StatusFilter;
  /** Substring match on `posts.content`. */
  query:        string;
  userId:       string | 'all';
  platform:     string | 'all';
  createdFrom:  string | null;
  createdTo:    string | null;
  scheduledFrom: string | null;
  scheduledTo:  string | null;
  sort:         PostSortOption;
}

/** Filtered & sorted page — ready for dashboard scale (count + range). */
export async function listPostsPage(
  params: ListPostsPageParams,
): Promise<{ posts: Post[]; total: number }> {
  const trimmed = params.query.trim();

  const selectBody =
    params.platform === 'all'
      ? POST_SELECT
      : POST_SELECT.replace(
          'post_platforms ( platform )',
          'post_platforms!inner ( platform )',
        );

  let req = supabase.from('posts').select(selectBody, { count: 'exact' });

  if (params.platform !== 'all') {
    req = req.eq('post_platforms.platform', params.platform);
  }

  if (params.status !== 'all') {
    req = req.eq('status', params.status);
  }

  if (params.userId !== 'all') {
    req = req.eq('user_id', params.userId);
  }

  if (params.createdFrom) {
    req = req.gte('created_at', params.createdFrom);
  }
  if (params.createdTo) {
    req = req.lte('created_at', params.createdTo);
  }

  if (params.scheduledFrom) {
    req = req.gte('scheduled_at', params.scheduledFrom);
  }
  if (params.scheduledTo) {
    req = req.lte('scheduled_at', params.scheduledTo);
  }

  if (trimmed) {
    req = req.ilike('content', `%${trimmed}%`);
  }

  switch (params.sort) {
    case 'newest':
      req = req.order('created_at', { ascending: false });
      break;
    case 'oldest':
      req = req.order('created_at', { ascending: true });
      break;
    case 'scheduled_soon':
      req = req.order('scheduled_at', {
        ascending:    true,
        nullsFirst:   false,
      });
      break;
    case 'failed_first':
      req = req
        .order('failure_sort_key', { ascending: true })
        .order('created_at', { ascending: false });
      break;
    default:
      req = req.order('created_at', { ascending: false });
  }

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  const { data, error, count } = await req.range(from, to);

  if (error) throw error;
  return {
    posts: ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow),
    total: count ?? 0,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow);
}

/** Single post with publish event timeline (when migration is applied). */
export async function getPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPostRow(data as unknown as RawPostRow) : null;
}

/**
 * Posts inside a UTC half-open `[start, end)` window that have `scheduled_at` set.
 * Used by `/dashboard/calendar`; RLS restricts rows to what the viewer may see.
 */
export async function listCalendarPosts(startIso: string, endIso: string): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', startIso)
    .lt('scheduled_at', endIso)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow);
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Publish a post immediately. Sets status, clears scheduled_at, stamps
 * published_at to now() so the feed can render real "Posted X ago" times.
 *
 * Caller-side RBAC: admin only. The DB enforces the same via RLS.
 */
export async function publishNow(id: string): Promise<Post> {
  const { error } = await supabase
    .from('posts')
    .update({
      status:       'published',
      scheduled_at: null,
      published_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  await syncPublishingPipeline(id);
  return refetchPostListShape(id);
}

/**
 * Reset a `failed` post back to `draft` so the author can edit + retry.
 * Clears `published_at` because the original publish never landed.
 */
export async function resetToDraft(id: string): Promise<Post> {
  const { error } = await supabase
    .from('posts')
    .update({
      status:       'draft',
      published_at: null,
    })
    .eq('id', id);

  if (error) throw error;
  await syncPublishingPipeline(id);
  return refetchPostListShape(id);
}

/** Clone an existing post into a new draft owned by the same user. */
export async function duplicatePost(post: Post): Promise<Post> {
  const { data: created, error } = await supabase
    .from('posts')
    .insert({
      user_id: post.user_id,
      content: post.content,
      status:  'draft',
    })
    .select('id')
    .single();

  if (error) throw error;

  if (post.platforms.length > 0) {
    const { error: platformError } = await supabase
      .from('post_platforms')
      .insert(post.platforms.map((p) => ({ post_id: created.id, platform: p })));
    if (platformError) {
      console.warn('[posts] duplicate: platforms insert failed:', platformError.message);
    }
  }

  const fresh = await getPost(created.id);
  if (!fresh) throw new Error('Failed to load duplicated post');
  await syncPublishingPipeline(fresh.id);
  return refetchPostListShape(fresh.id);
}

/**
 * Planner drag-and-drop: move `scheduled_at` while leaving status/workflow untouched.
 */
export async function rescheduleCalendarPost(
  id: string,
  scheduledAtIso: string,
): Promise<Post> {
  const { error } = await supabase
    .from('posts')
    .update({
      scheduled_at: scheduledAtIso,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  await syncPublishingPipeline(id);
  return refetchPostListShape(id);
}

/** Calendar/modal workflow edits — constrained columns; RLS is the gate. */
export async function patchPostLifecycle(
  id: string,
  patch: Partial<Pick<Post, 'status' | 'scheduled_at' | 'published_at'>>,
): Promise<Post> {
  const { error } = await supabase
    .from('posts')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  await syncPublishingPipeline(id);
  return refetchPostListShape(id);
}

// ── Bulk mutations (sequential — predictable RLS + error surfacing) ────────

export async function bulkDeletePosts(ids: string[]): Promise<void> {
  for (const id of ids) await deletePost(id);
}

export async function bulkPublishNow(ids: string[]): Promise<Post[]> {
  const out: Post[] = [];
  for (const id of ids) {
    out.push(await publishNow(id));
  }
  return out;
}

export async function bulkMoveToDraft(ids: string[]): Promise<Post[]> {
  const out: Post[] = [];
  for (const id of ids) {
    out.push(
      await patchPostLifecycle(id, {
        status:       'draft',
        scheduled_at: null,
        published_at: null,
      }),
    );
  }
  return out;
}

export async function bulkSchedulePosts(
  ids: string[],
  scheduledAtIso: string,
): Promise<Post[]> {
  const out: Post[] = [];
  for (const id of ids) {
    let row = await rescheduleCalendarPost(id, scheduledAtIso);
    if (row.status !== 'scheduled') {
      row = await patchPostLifecycle(id, {
        status:       'scheduled',
        scheduled_at: scheduledAtIso,
      });
    }
    out.push(row);
  }
  return out;
}
