import { notFound, redirect } from 'next/navigation';

import { requireWriter } from '@/features/auth/server';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';
import { isAdmin } from '@/lib/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { ComposeForm } from '../../compose/ComposeForm';
import { FacebookPostInsightsSection } from '../../compose/FacebookPostInsightsSection';

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

  const post = mapPostRow(row);

  return (
    <div className="space-y-8 pb-10">
      <ComposeForm initialPost={post} userRole={auth.role} />
      {post.external_post_id ? (
        <div className="px-4 md:px-2">
          <FacebookPostInsightsSection postId={post.id} />
        </div>
      ) : null}
    </div>
  );
}
