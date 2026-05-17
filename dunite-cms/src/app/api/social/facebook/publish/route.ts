import { NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import {
  canFacebookScheduleOrRetry,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { publishFacebookPost } from '@/lib/social/facebook/publisher';
import { formatZodError, facebookPublishBodySchema } from '@/lib/social/facebook/validator';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const LOCK_TTL_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return failJson('Invalid JSON body', 400);
  }

  const parsed = facebookPublishBodySchema.safeParse(json);
  if (!parsed.success) {
    return failJson(formatZodError(parsed.error), 422, 'validation_error');
  }

  let userId: string;
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    userId = auth.user.id;
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const gate = await resolveOrgPublishGate(userId);
  if (!gate) {
    return failJson('Post not found or access denied.', 403, 'no_org');
  }

  if (!canFacebookScheduleOrRetry(gate)) {
    await insertPostPublishActivityLog({
      userId,
      postId: parsed.data.postId,
      actionType: 'unauthorized_publish_attempt',
      message: 'User lacks permission for Facebook publish.',
      metadata: { organization_id: gate.organizationId },
    });
    return failJson('Insufficient permissions.', 403, 'forbidden');
  }

  const admin = createSupabaseAdminClient();
  const postId = parsed.data.postId;
  const nowIso = new Date().toISOString();
  const now = Date.now();

  const { data: row, error: loadErr } = await admin
    .from('posts')
    .select('id, organization_id, publish_locked_at')
    .eq('id', postId)
    .maybeSingle();

  if (loadErr) {
    return failJson(loadErr.message, 500);
  }
  if (!row?.id) {
    return failJson('Post not found or access denied.', 404, 'not_found');
  }

  if (!row.organization_id) {
    await admin
      .from('posts')
      .update({ organization_id: gate.organizationId })
      .eq('id', postId);
    row.organization_id = gate.organizationId;
  } else if (row.organization_id !== gate.organizationId) {
    return failJson('Post not found or access denied.', 403, 'org_mismatch');
  }

  if (row.publish_locked_at) {
    const lockedAt = new Date(row.publish_locked_at).getTime();
    if (!Number.isNaN(lockedAt) && now - lockedAt < LOCK_TTL_MS && now - lockedAt >= 0) {
      return failJson(
        'Post is already being published. Please wait.',
        409,
        'locked',
      );
    }
  }

  const { data: patched, error: lockErr } = await admin
    .from('posts')
    .update({
      publish_locked_at: nowIso,
      publish_locked_by: userId,
    })
    .eq('id', postId)
    .select('id')
    .maybeSingle();

  if (lockErr) {
    return failJson(lockErr.message, 500);
  }
  if (!patched) {
    return failJson('Post not found or access denied.', 404, 'not_found');
  }

  try {
    const result = await publishFacebookPost({
      postId,
      socialAccountId: parsed.data.socialAccountId,
      gate,
    });
    return okJson({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'publish_failed';
    await admin.from('posts').update({
      publish_locked_at:  null,
      publish_locked_by:  null,
      last_publish_error: msg.slice(0, 2048),
      updated_at:         new Date().toISOString(),
    }).eq('id', postId);

    return failJson(msg, 500, 'publish_failed');
  }
}
