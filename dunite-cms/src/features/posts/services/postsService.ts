import { supabase } from '@/lib/supabaseClient';

import {
  POST_DETAIL_SELECT,
  POST_SELECT,
  mapPostRow,
  type RawPostRow,
} from '../queries';
import type { Post } from '../types';
import type { StatusFilter } from '../types';

interface CalendarFiltersLike {
  platform: 'all' | string;
  status: 'all' | string;
  userId: 'all' | string;
}

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
  const params = new URLSearchParams({
    start: startIso,
    end: endIso,
    page: '1',
    pageSize: '500',
  });
  const res = await fetch(`/api/calendar/posts?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: { items?: Post[] };
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? 'Could not load calendar posts');
  }
  return json.data?.items ?? [];
}

export async function listCalendarPostsWithFilters(args: {
  startIso: string;
  endIso: string;
  filters: CalendarFiltersLike & {
    failedOnly?: boolean;
    scheduledOnly?: boolean;
    mediaOnly?: boolean;
  };
  page?: number;
  pageSize?: number;
  cursor?: string;
}): Promise<{ items: Post[]; total: number; hasMore: boolean; nextCursor: string | null }> {
  const params = new URLSearchParams({
    start: args.startIso,
    end: args.endIso,
    page: String(args.page ?? 1),
    pageSize: String(args.pageSize ?? 250),
  });
  if (args.filters.platform && args.filters.platform !== 'all') {
    params.set('platform', args.filters.platform);
  }
  if (args.filters.status && args.filters.status !== 'all') {
    params.set('status', args.filters.status);
  }
  if (args.filters.userId && args.filters.userId !== 'all') {
    params.set('userId', args.filters.userId);
  }
  if (args.filters.failedOnly) params.set('failedOnly', 'true');
  if (args.filters.scheduledOnly) params.set('scheduledOnly', 'true');
  if (args.filters.mediaOnly) params.set('mediaOnly', 'true');
  if (args.cursor) params.set('cursor', args.cursor);

  const res = await fetch(`/api/calendar/posts?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: { items?: Post[]; total?: number; hasMore?: boolean; nextCursor?: string | null };
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? 'Could not load calendar posts');
  }
  return {
    items: json.data?.items ?? [],
    total: json.data?.total ?? 0,
    hasMore: json.data?.hasMore ?? false,
    nextCursor: json.data?.nextCursor ?? null,
  };
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
  expectedUpdatedAt?: string,
): Promise<Post> {
  const res = await fetch('/api/calendar/reschedule', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postId: id,
      scheduledAtIsoUtc: scheduledAtIso,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string; data?: { post?: Post } };
  if (!res.ok || !json.ok || !json.data?.post) {
    throw new Error(json.error ?? 'Could not reschedule post');
  }
  return json.data.post;
}

export async function resizeCalendarPost(
  id: string,
  startAtIsoUtc: string,
  endAtIsoUtc: string,
  expectedUpdatedAt?: string,
): Promise<Post> {
  const res = await fetch('/api/calendar/resize', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postId: id,
      startAtIsoUtc,
      endAtIsoUtc,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string; data?: { post?: Post } };
  if (!res.ok || !json.ok || !json.data?.post) {
    throw new Error(json.error ?? 'Could not resize post');
  }
  return json.data.post;
}

export async function bulkRescheduleCalendarPosts(items: Array<{
  id: string;
  scheduledAtIso: string;
  expectedUpdatedAt?: string;
}>): Promise<{ updated: Post[]; failed: Array<{ postId: string; error: string }> }> {
  const res = await fetch('/api/calendar/bulk-reschedule', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map((x) => ({
        postId: x.id,
        scheduledAtIsoUtc: x.scheduledAtIso,
        ...(x.expectedUpdatedAt ? { expectedUpdatedAt: x.expectedUpdatedAt } : {}),
      })),
    }),
  });
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    data?: {
      updated?: Post[];
      failed?: Array<{ postId: string; error: string }>;
    };
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? 'Bulk reschedule failed');
  }
  return {
    updated: json.data?.updated ?? [],
    failed: json.data?.failed ?? [],
  };
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
