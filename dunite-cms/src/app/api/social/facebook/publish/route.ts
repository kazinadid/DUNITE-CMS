import { NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import {
  canFacebookPublishImmediately,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { publishFacebookPost } from '@/lib/social/facebook/publisher';
import { formatZodError, facebookPublishBodySchema } from '@/lib/social/facebook/validator';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
    return failJson('No organization membership found.', 403);
  }

  if (!canFacebookPublishImmediately(gate)) {
    await insertPostPublishActivityLog({
      userId,
      postId: parsed.data.postId,
      actionType: 'unauthorized_publish_attempt',
      message: 'User lacks permission for immediate Facebook publish.',
      metadata: { organization_id: gate.organizationId },
    });
    return failJson('Insufficient permissions.', 403, 'forbidden');
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: patched, error: lockErr } = await admin
    .from('posts')
    .update({
      status:            'publishing',
      publish_locked_at: now,
      publish_locked_by: userId,
    })
    .eq('id', parsed.data.postId)
    .in('status', ['draft', 'scheduled', 'queued', 'failed', 'retrying'])
    .select('id')
    .maybeSingle();

  if (lockErr) {
    return failJson(lockErr.message, 500);
  }
  if (!patched) {
    return failJson(
      'Post cannot be locked for publishing (wrong state or not found).',
      409,
      'conflict',
    );
  }

  try {
    const result = await publishFacebookPost({
      postId: parsed.data.postId,
      socialAccountId: parsed.data.socialAccountId,
      gate,
    });
    return okJson({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'publish_failed';
    await admin.from('posts').update({
      status:             'failed',
      publish_locked_at:  null,
      publish_locked_by:  null,
      last_publish_error: msg.slice(0, 2048),
      updated_at:         new Date().toISOString(),
    }).eq('id', parsed.data.postId);

    return failJson(msg, 500, 'publish_failed');
  }
}