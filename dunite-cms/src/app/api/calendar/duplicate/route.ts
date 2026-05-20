import { NextRequest } from 'next/server';

import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { requireCalendarGate, assertEditablePostInOrg } from '@/features/calendar/api/server';
import { POST_SELECT, mapPostRow, type RawPostRow } from '@/features/posts/queries';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const duplicateSchema = z.object({
  postId: z.string().uuid(),
});

/**
 * POST /api/calendar/duplicate
 * 
 * Duplicates a calendar post into a new draft.
 * Copies content, platforms, and media references.
 * New post is owned by the same user but in draft status.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failJson('Invalid JSON body.', 400, 'validation_error');
  }

  const parsed = duplicateSchema.safeParse(body);
  if (!parsed.success) {
    return failJson(
      parsed.error.issues[0]?.message ?? 'Invalid payload.',
      422,
      'validation_error',
    );
  }

  try {
    const { gate } = await requireCalendarGate();
    const { postId } = parsed.data;

    // Verify post exists and belongs to organization
    await assertEditablePostInOrg(postId, gate.organizationId);

    const admin = createSupabaseAdminClient();

    // Fetch the original post with all relations
    const { data: original, error: fetchError } = await admin
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .single();

    if (fetchError || !original) {
      return failJson('Post not found.', 404, 'not_found');
    }

    const post = original as unknown as RawPostRow;

    // Create duplicate
    const { data: created, error: createError } = await admin
      .from('posts')
      .insert({
        user_id: post.user_id,
        organization_id: gate.organizationId,
        content: post.content,
        status: 'draft',
        scheduled_at: null,
        published_at: null,
      })
      .select('id')
      .single();

    if (createError || !created) {
      return failJson('Failed to create duplicate.', 500, 'create_failed');
    }

    const newPostId = created.id;

    // Copy platforms
    if (post.post_platforms && post.post_platforms.length > 0) {
      const { error: platformError } = await admin
        .from('post_platforms')
        .insert(
          post.post_platforms.map((p: { platform: string }) => ({
            post_id: newPostId,
            platform: p.platform,
          })),
        );

      if (platformError) {
        console.warn('[calendar/duplicate] platforms copy failed:', platformError.message);
      }
    }

    // Fetch the complete new post
    const { data: fullPost, error: refetchError } = await admin
      .from('posts')
      .select(POST_SELECT)
      .eq('id', newPostId)
      .single();

    if (refetchError || !fullPost) {
      return failJson('Failed to load duplicated post.', 500, 'refetch_failed');
    }

    // Sync publishing pipeline for the new post
    const { error: syncError } = await admin.rpc('replace_publishing_jobs', {
      p_post_id: newPostId,
    });

    if (syncError) {
      console.warn('[calendar/duplicate] publishing sync failed:', syncError.message);
    }

    const response = okJson({
      post: mapPostRow(fullPost as unknown as RawPostRow),
      originalPostId: postId,
    });

    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    return response;
  } catch (e) {
    return failJson(
      e instanceof Error ? e.message : 'Duplicate failed.',
      400,
      'duplicate_failed',
    );
  }
}
