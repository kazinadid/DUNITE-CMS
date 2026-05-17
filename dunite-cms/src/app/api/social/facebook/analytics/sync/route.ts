import { NextRequest } from 'next/server';

import { insertAnalyticsAuditLog } from '@/lib/activity/analyticsAudit';
import {
  resolveOrgPublishGate,
  canManageFacebookAnalyticsSync,
} from '@/lib/org/publishGate';
import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { refreshAnalyticsCache } from '@/lib/social/facebook/insights/cache';
import {
  facebookAnalyticsSyncBodySchema,
  formatZodError,
} from '@/lib/social/facebook/insights/validator';
import { syncOrganizationAnalytics, syncPostAnalytics } from '@/lib/social/facebook/insights/syncWorker';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let userId: string;
  let gate;
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    userId = auth.user.id;
    gate = await resolveOrgPublishGate(userId);
    if (!gate || !canManageFacebookAnalyticsSync(gate)) {
      return failJson('Insufficient permissions.', 403, 'forbidden');
    }
  } catch {
    return failJson('Not authenticated.', 401);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return failJson('Invalid JSON.', 400);
  }

  const parsed = facebookAnalyticsSyncBodySchema.safeParse(json);
  if (!parsed.success) return failJson(formatZodError(parsed.error), 422);

  const orgId = gate.organizationId;

  try {
    await insertAnalyticsAuditLog({
      userId,
      organizationId: orgId,
      actionType: 'analytics_sync_started',
      message: 'Manual Facebook analytics sync requested.',
      metadata: {
        scoped_posts: parsed.data.postIds?.length ?? 0,
      },
    });

    if (parsed.data.postIds?.length) {
      let okCount = 0;
      let failMsg: string[] = [];
      for (const pid of parsed.data.postIds) {
        const r = await syncPostAnalytics({ organizationId: orgId, postId: pid });
        if (r.ok) okCount++;
        else failMsg.push(`${pid}:${r.error}`);
      }

      refreshAnalyticsCache(orgId);
      await insertAnalyticsAuditLog({
        userId,
        organizationId: orgId,
        actionType: okCount > 0 ? 'analytics_sync_completed' : 'analytics_sync_failed',
        message: `Targeted sync finished ${okCount}/${parsed.data.postIds.length}.`,
        metadata: { failures: failMsg.slice(0, 5) },
      });

      return okJson({ mode: 'targeted' as const, okCount, errors: failMsg });
    }

    const stats = await syncOrganizationAnalytics({
      organizationId: orgId,
      maxPosts: 40,
    });
    refreshAnalyticsCache(orgId);

    return okJson({ mode: 'workspace' as const, stats });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'sync_failed', 500);
  }
}
