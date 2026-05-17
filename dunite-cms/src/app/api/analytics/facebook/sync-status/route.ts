import { type NextRequest } from 'next/server';

import {
  facebookAnalyticsCapabilities,
  parseSearch,
  resolveFacebookAnalyticsGate,
} from '@/lib/social/facebook/analytics/httpGuards';
import { countConnectedFacebookAccounts } from '@/lib/social/facebook/analytics/facebookIntegrationPreflight';
import { normalizeThrownError } from '@/lib/social/facebook/analytics/normalizeThrownError';
import {
  listRecentAnalyticsQueueForOrg,
  listRecentAnalyticsSyncLogs,
} from '@/lib/social/facebook/analyticsDb';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { failJson, okJson } from '@/lib/social/http/apiResponse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gateResp = await resolveFacebookAnalyticsGate();
  if (!gateResp.ok) return gateResp.response;

  const qs = parseSearch(req);
  const limitQueue = clampLimit(Number(qs.get('limitQueue')));
  const limitLogs = clampLimit(Number(qs.get('limitLogs')));

  try {
    const orgId = gateResp.gate.organizationId;

    let connectedFacebookPages = 0;
    try {
      connectedFacebookPages = await countConnectedFacebookAccounts(orgId);
    } catch {
      connectedFacebookPages = 0;
    }

    const [queue, logs] = await Promise.all([
      listRecentAnalyticsQueueForOrg(orgId, limitQueue),
      listRecentAnalyticsSyncLogs(orgId, limitLogs),
    ]);

    /** Surface lightweight post sync states for the UI without scraping every row. */
    const admin = createSupabaseAdminClient();
    const { data: syncingSample } = await admin
      .from('posts')
      .select('id, fb_analytics_sync_status, fb_analytics_last_synced_at')
      .eq('organization_id', orgId)
      .in('fb_analytics_sync_status', ['syncing', 'stale', 'failed'])
      .order('updated_at', { ascending: false })
      .limit(30);

    return okJson({
      capabilities: facebookAnalyticsCapabilities(gateResp.gate),
      facebook: {
        connected: connectedFacebookPages > 0,
        connectedPagesCount: connectedFacebookPages,
      },
      queueJobs: queue,
      syncLogs:  logs,
      postSyncIndicators: syncingSample ?? [],
    });
  } catch (e: unknown) {
    return failJson(normalizeThrownError(e).message, 500);
  }
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return 40;
  return Math.min(150, Math.max(5, Math.floor(n)));
}
