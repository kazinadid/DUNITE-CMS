import { notFound, redirect } from 'next/navigation';

import { requireWriter } from '@/features/auth/server';
import type { Post, PostStatus } from '@/features/posts';
import { isAdmin } from '@/lib/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { ComposeForm } from '../../compose/ComposeForm';

const POST_SELECT = `
  id, user_id, content, status, scheduled_at, created_at, updated_at,
  author:users!posts_user_id_fkey ( id, name, email ),
  post_platforms ( platform )
`;

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

export const dynamic = 'force-dynamic';

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await requireWriter();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[edit-post] failed to load post:', error.message);
    notFound();
  }
  if (!data) notFound();

  const row = data as unknown as RawPostRow;

  // Editors may only edit their own posts; admins may edit anything.
  if (!isAdmin(auth.role) && row.user_id !== auth.user.id) {
    redirect('/dashboard/posts');
  }

  const post: Post = {
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

  return <ComposeForm initialPost={post} />;
}
