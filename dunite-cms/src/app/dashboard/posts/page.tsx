import { requireUser } from '@/features/auth/server';
import type { Post } from '@/features/posts';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { PostsPageClient } from './PostsPageClient';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

export default async function PostsPage() {
  const auth = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error, count } = await supabase
    .from('posts')
    .select(POST_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  const posts: Post[] = ((data ?? []) as unknown as RawPostRow[]).map(mapPostRow);

  return (
    <PostsPageClient
      initialPosts={posts}
      initialTotal={count ?? posts.length}
      initialError={error?.message ?? null}
      currentUserId={auth.user.id}
      role={auth.role}
    />
  );
}
