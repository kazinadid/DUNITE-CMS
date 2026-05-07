import { supabase } from '@/lib/supabaseClient';

import type { Post, PostStatus } from '../types';

// ── Shared select expression ────────────────────────────────────────────────
//
// We always read author + platforms so the UI can render a fully-formed card
// without round-trips.  RLS on `posts` is the security boundary — viewers can
// SELECT, only writers can INSERT/UPDATE/DELETE (see migration 0001_rbac.sql).
const POST_SELECT = `
  id, user_id, content, status, scheduled_at, created_at, updated_at,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform )
`;

interface RawPost {
  id: string;
  user_id: string;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  author: { id: string; name: string | null; email: string } | null;
  post_platforms: { platform: string }[] | null;
}

function mapRow(row: RawPost): Post {
  return {
    id:           row.id,
    user_id:      row.user_id,
    content:      row.content,
    status:       row.status,
    scheduled_at: row.scheduled_at,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
    author:       row.author,
    platforms:    (row.post_platforms ?? []).map((p) => p.platform),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as RawPost[]).map(mapRow);
}

export async function getPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data as unknown as RawPost) : null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

/** Publish a scheduled or draft post immediately. */
export async function publishNow(id: string): Promise<Post> {
  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', scheduled_at: null })
    .eq('id', id)
    .select(POST_SELECT)
    .single();

  if (error) throw error;
  return mapRow(data as unknown as RawPost);
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
