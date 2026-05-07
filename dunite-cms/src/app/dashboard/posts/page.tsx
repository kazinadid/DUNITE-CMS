import { requireUser } from '@/features/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Post, PostStatus } from '@/features/posts';

import { PostsPageClient } from './PostsPageClient';

export const dynamic = 'force-dynamic';

interface RawPostRow {
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

const POST_SELECT = `
  id, user_id, content, status, scheduled_at, created_at, updated_at,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform )
`;

export default async function PostsPage() {
  const auth = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  const posts: Post[] = ((data ?? []) as unknown as RawPostRow[]).map((row) => ({
    id:           row.id,
    user_id:      row.user_id,
    content:      row.content,
    status:       row.status,
    scheduled_at: row.scheduled_at,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
    author:       row.author,
    platforms:    (row.post_platforms ?? []).map((p) => p.platform),
  }));

  return (
    <PostsPageClient
      initialPosts={posts}
      initialError={error?.message ?? null}
      currentUserId={auth.user.id}
      role={auth.role}
    />
  );
}
