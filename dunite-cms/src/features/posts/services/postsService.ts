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
