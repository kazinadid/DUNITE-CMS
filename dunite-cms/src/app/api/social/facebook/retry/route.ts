import { NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { insertPostPublishActivityLog } from '@/lib/activity/postActivityLog';
import {
  canFacebookScheduleOrRetry,
  resolveOrgPublishGate,
} from '@/lib/org/publishGate';
import { okJson, failJson } from '@/lib/social/http/apiResponse';
import { formatZodError, facebookRetryBodySchema } from '@/lib/social/facebook/validator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return failJson('Invalid JSON body', 400);
  }

  const parsed = facebookRetryBodySchema.safeParse(json);
  if (!parsed.success) {
    return failJson(formatZodError(parsed.error), 422, 'validation_error');
  }

  let userId: string;
  let supabase: Awaited<
    ReturnType<typeof createAuthenticatedSupabaseServerClient>
  >['supabase'];
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    userId = auth.user.id;
    supabase = auth.supabase;
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const gate = await resolveOrgPublishGate(userId);
  if (!gate) return failJson('No organization membership found.', 403);

  if (!canFacebookScheduleOrRetry(gate)) {
    await insertPostPublishActivityLog({
      userId,
      postId: parsed.data.postId,
      actionType: 'unauthorized_publish_attempt',
      message: 'User lacks permission to retry Facebook publishing.',
      metadata: { organization_id: gate.organizationId },
    });
    return failJson('Insufficient permissions.', 403, 'forbidden');
  }

  const { data: job, error: jobErr } = await supabase
    .from('publishing_jobs')
    .select('id')
    .eq('post_id', parsed.data.postId)
    .eq('platform', 'facebook')
    .maybeSingle();

  if (jobErr) return failJson(jobErr.message, 500);
  if (!job?.id) {
    return failJson(
      'No Facebook publishing job exists for this post.',
      404,
      'job_not_found',
    );
  }

  await insertPostPublishActivityLog({
    userId,
    postId: parsed.data.postId,
    actionType: 'retry_attempted',
    message: 'Manual Facebook retry requested.',
    metadata: {
      organization_id: gate.organizationId,
      publishing_job_id: job.id,
    },
  });

  const { error } = await supabase.rpc('retry_publishing_job', {
    p_job_id: job.id,
  });

  if (error) {
    await insertPostPublishActivityLog({
      userId,
      postId: parsed.data.postId,
      actionType: 'publish_failed',
      message: 'Retry RPC failed.',
      metadata: {
        organization_id: gate.organizationId,
        rpc_error: error.message.slice(0, 400),
      },
    });
    return failJson(error.message, 500, 'retry_failed');
  }

  await supabase
    .from('posts')
    .update({
      status:           'scheduled',
      last_publish_error: null,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', parsed.data.postId);

  return okJson({ jobId: job.id });
}
