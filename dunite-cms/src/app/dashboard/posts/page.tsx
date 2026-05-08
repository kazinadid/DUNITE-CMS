import { requireUser } from '@/features/auth/server';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';
import type { Post } from '@/features/posts';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { PostsPageClient } from './PostsPageClient';

export const dynamic = 'force-dynamic';

export default async function PostsPage() {
  const auth = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  const posts: Post[] = ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow);

  return (
    <PostsPageClient
      initialPosts={posts}
      initialError={error?.message ?? null}
      currentUserId={auth.user.id}
      role={auth.role}
    />
  );
}
