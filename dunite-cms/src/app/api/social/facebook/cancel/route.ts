import { NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import {
  canFacebookScheduleOrRetry,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { formatZodError, facebookCancelBodySchema } from '@/lib/social/facebook/validator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return failJson('Invalid JSON body', 400);
  }

  const parsed = facebookCancelBodySchema.safeParse(json);
  if (!parsed.success) {
    return failJson(formatZodError(parsed.error), 422, 'validation_error');
  }

  let authClient: Awaited<
    ReturnType<typeof createAuthenticatedSupabaseServerClient>
  >;
  try {
    authClient = await createAuthenticatedSupabaseServerClient();
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const { user, supabase } = authClient;
  const gate = await resolveOrgPublishGate(user.id);
  if (!gate) return failJson('No organization membership found.', 403);

  if (!canFacebookScheduleOrRetry(gate)) {
    await insertPostPublishActivityLog({
      userId: user.id,
      postId: parsed.data.postId,
      actionType: 'unauthorized_publish_attempt',
      message: 'User lacks permission to cancel Facebook scheduling.',
      metadata: { organization_id: gate.organizationId },
    });
    return failJson('Insufficient permissions.', 403, 'forbidden');
  }

  const admin = createSupabaseAdminClient();
  const { data: post } = await admin
    .from('posts')
    .select('organization_id')
    .eq('id', parsed.data.postId)
    .maybeSingle();

  if (post?.organization_id && post.organization_id !== gate.organizationId) {
    return failJson('Post belongs to another organization.', 403, 'org_mismatch');
  }

  const { error: upErr } = await supabase
    .from('posts')
    .update({
      status:       'cancelled',
      scheduled_at: null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', parsed.data.postId);

  if (upErr) return failJson(upErr.message, 500);

  const { error: rpcErr } = await supabase.rpc('replace_publishing_jobs', {
    p_post_id: parsed.data.postId,
  });

  if (rpcErr) {
    return failJson(`Jobs cleanup failed: ${rpcErr.message}`, 500);
  }

  await insertPostPublishActivityLog({
    userId: user.id,
    postId: parsed.data.postId,
    actionType: 'scheduled_publish_completed',
    message: 'Publishing schedule cancelled.',
    metadata: {
      organization_id: gate.organizationId,
      cancelled: true,
    },
  });

  return okJson({ cancelled: true as const });
}
