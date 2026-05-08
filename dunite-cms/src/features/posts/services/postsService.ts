import { supabase } from '@/lib/supabaseClient';

import { POST_SELECT, mapPostRow, type RawPostRow } from '../queries';
import type { Post } from '../types';

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow);
}

export async function getPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
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

// ── Writes ───────────────────────────────────────────────────────────────────

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
  const { data, error } = await supabase
    .from('posts')
    .update({
      status:       'published',
      scheduled_at: null,
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return mapPostRow(data as unknown as RawPostRow);
}

/**
 * Reset a `failed` post back to `draft` so the author can edit + retry.
 * Clears `published_at` because the original publish never landed.
 */
export async function resetToDraft(id: string): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({
      status:       'draft',
      published_at: null,
    })
    .eq('id', id)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return mapPostRow(data as unknown as RawPostRow);
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
  return fresh;
}

/**
 * Planner drag-and-drop: move `scheduled_at` while leaving status/workflow untouched.
 */
export async function rescheduleCalendarPost(
  id: string,
  scheduledAtIso: string,
): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({
      scheduled_at: scheduledAtIso,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return mapPostRow(data as unknown as RawPostRow);
}

/** Calendar/modal workflow edits — constrained columns; RLS is the gate. */
export async function patchPostLifecycle(
  id: string,
  patch: Partial<Pick<Post, 'status' | 'scheduled_at' | 'published_at'>>,
): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return mapPostRow(data as unknown as RawPostRow);
}
