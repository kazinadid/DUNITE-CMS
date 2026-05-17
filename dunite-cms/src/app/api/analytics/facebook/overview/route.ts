import { type NextRequest } from 'next/server';

import {
  facebookAnalyticsCapabilities,
  parseSearch,
  resolveFacebookAnalyticsGate,
} from '@/lib/social/facebook/analytics/httpGuards';
import {
  analyticsOverviewQuerySchema,
  formatZodError,
} from '@/lib/social/facebook/analytics/browserApiSchemas';
import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { insertAnalyticsAuditLog } from '@/lib/activity/analyticsAudit';
import { getFacebookAnalyticsDashboardPayload } from '@/lib/social/facebook/analyticsDashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gateResp = await resolveFacebookAnalyticsGate();
  if (!gateResp.ok) return gateResp.response;

  const qs = parseSearch(req);
  const parse = analyticsOverviewQuerySchema.safeParse(Object.fromEntries(qs.entries()));
  if (!parse.success) {
    return failJson(formatZodError(parse.error), 422);
  }

  const { from, to, socialAccountId, auditView } = parse.data;

  try {
    if (auditView === '1') {
      await insertAnalyticsAuditLog({
        userId:         gateResp.userId,
        organizationId: gateResp.gate.organizationId,
        actionType:     'analytics_viewed',
        message:        'Facebook analytics overview opened.',
        metadata:       { path: req.nextUrl.pathname },
      });
    }

    const result = await getFacebookAnalyticsDashboardPayload({
      organizationId: gateResp.gate.organizationId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      socialAccountId,
    });

    return okJson({
      ...result,
      capabilities: facebookAnalyticsCapabilities(gateResp.gate),
    });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'dashboard_failed', 500);
  }
}
