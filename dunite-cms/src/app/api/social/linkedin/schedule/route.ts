import { NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import {
  canFacebookScheduleOrRetry,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { formatZodError, linkedInScheduleBodySchema } from '@/lib/social/linkedin/validator';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return failJson('Invalid JSON body', 400);
  }

  const parsed = linkedInScheduleBodySchema.safeParse(json);
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
    return failJson('Insufficient permissions.', 403, 'forbidden');
  }

  const supabase = createSupabaseAdminClient();

  const { data: post } = await supabase
    .from('posts')
    .select('id, organization_id, status')
    .eq('id', parsed.data.postId)
    .maybeSingle();

  if (!post?.id) {
    return failJson('Post not found.', 404);
  }

  if (!post.organization_id) {
    await supabase
      .from('posts')
      .update({ organization_id: gate.organizationId })
      .eq('id', parsed.data.postId);
  } else if (post.organization_id !== gate.organizationId) {
    return failJson('Post not found or access denied.', 403, 'org_mismatch');
  }

  const patch = {
    scheduled_at: parsed.data.scheduledFor,
    status: 'scheduled' as const,
    social_account_id: parsed.data.socialAccountId,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from('posts')
    .update(patch)
    .eq('id', parsed.data.postId);

  if (upErr) return failJson(upErr.message, 500);

  const { error: rpcErr } = await supabase.rpc('replace_publishing_jobs', {
    p_post_id: parsed.data.postId,
  });

  if (rpcErr) {
    return failJson(`Jobs sync failed: ${rpcErr.message}`, 500);
  }

  await insertPostPublishActivityLog({
    userId: userId,
    postId: parsed.data.postId,
    actionType: 'scheduled_publish_started',
    message: 'LinkedIn schedule registered via CMS API.',
    metadata: {
      organization_id: gate.organizationId,
      scheduled_for: parsed.data.scheduledFor,
    },
  });

  return okJson({ scheduledFor: parsed.data.scheduledFor });
}
