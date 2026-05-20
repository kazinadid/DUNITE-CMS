import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { resolveOrgPublishGate } from '@/lib/org/publishGate';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedSupabaseServerClient();
    const gate = await resolveOrgPublishGate(user.id);
    if (!gate) {
      return failJson('No organization membership found.', 403, 'forbidden');
    }

    const base = supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', gate.organizationId);

    const [{ count: total, error: totalErr }, { count: scheduled, error: scheduledErr }, { count: failed, error: failedErr }] =
      await Promise.all([
        base,
        supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', gate.organizationId)
          .eq('status', 'scheduled'),
        supabase
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', gate.organizationId)
          .eq('status', 'failed'),
      ]);

    if (totalErr || scheduledErr || failedErr) {
      return failJson(
        totalErr?.message ?? scheduledErr?.message ?? failedErr?.message ?? 'Could not load stats.',
        500,
        'query_failed',
      );
    }

    return okJson({
      organizationId: gate.organizationId,
      counts: {
        total: total ?? 0,
        scheduled: scheduled ?? 0,
        failed: failed ?? 0,
      },
    });
  } catch (e) {
    return failJson(e instanceof Error ? e.message : 'Not authenticated.', 401, 'unauthorized');
  }
}
