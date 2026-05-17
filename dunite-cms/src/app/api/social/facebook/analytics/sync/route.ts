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
import { countConnectedFacebookAccounts } from '@/lib/social/facebook/analytics/facebookIntegrationPreflight';
import { normalizeThrownError } from '@/lib/social/facebook/analytics/normalizeThrownError';
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

  const CONNECT_COPY =
    'No connected platforms found. Please connect a platform first before syncing.';
  try {
    const fbPages = await countConnectedFacebookAccounts(orgId);
    if (fbPages < 1) {
      return failJson(CONNECT_COPY, 422, 'facebook_not_connected');
    }

    await insertAnalyticsAuditLog({
      userId,
      organizationId: orgId,
      actionType: 'analytics_manual_refresh',
      message: 'Manual Facebook analytics refresh started.',
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
    const err = normalizeThrownError(e);
    console.error('[analytics/sync]', err.message, err);
    return failJson(err.message, 500);
  }
}
