import { NextRequest } from 'next/server';

import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { requireCalendarGate, assertEditablePostInOrg } from '@/features/calendar/api/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bulkDeleteSchema = z.object({
  postIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * DELETE /api/calendar/bulk-delete
 * 
 * Deletes multiple calendar posts in a single request.
 * Validates organization ownership for each post before deletion.
 * Returns partial success if some deletions fail.
 */
export async function DELETE(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failJson('Invalid JSON body.', 400, 'validation_error');
  }

  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return failJson(
      parsed.error.issues[0]?.message ?? 'Invalid payload.',
      422,
      'validation_error',
    );
  }

  try {
    const { gate } = await requireCalendarGate();
    const { postIds } = parsed.data;

    const deleted: string[] = [];
    const failed: Array<{ postId: string; error: string }> = [];

    const admin = createSupabaseAdminClient();

    for (const postId of postIds) {
      try {
        // Verify post belongs to organization and is editable
        await assertEditablePostInOrg(postId, gate.organizationId);

        // Delete the post (cascade will handle related records)
        const { error } = await admin
          .from('posts')
          .delete()
          .eq('id', postId)
          .eq('organization_id', gate.organizationId);

        if (error) {
          failed.push({ postId, error: error.message });
        } else {
          deleted.push(postId);
        }
      } catch (e) {
        failed.push({
          postId,
          error: e instanceof Error ? e.message : 'Deletion failed',
        });
      }
    }

    const response = okJson({
      deleted,
      failed,
      successCount: deleted.length,
      failedCount: failed.length,
    });

    // Cache-busting for mutations
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    return response;
  } catch (e) {
    return failJson(
      e instanceof Error ? e.message : 'Bulk delete failed.',
      400,
      'bulk_delete_failed',
    );
  }
}
