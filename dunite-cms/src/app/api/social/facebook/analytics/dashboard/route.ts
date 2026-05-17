import { type NextRequest } from 'next/server';

import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  resolveOrgPublishGate,
  canViewFacebookAnalytics,
  canExportFacebookAnalytics,
  canManageFacebookAnalyticsSync,
} from '@/lib/org/publishGate';
import { failJson, okJson } from '@/lib/social/http/apiResponse';
import {
  facebookDashboardQuerySchema,
  formatZodError,
} from '@/lib/social/facebook/insights/validator';
import { insertAnalyticsAuditLog } from '@/lib/activity/analyticsAudit';
import { getFacebookAnalyticsDashboardPayload } from '@/lib/social/facebook/analyticsDashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let gate;
  let userId: string;
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    userId = auth.user.id;
    gate = await resolveOrgPublishGate(userId);
    if (!gate || !canViewFacebookAnalytics(gate)) {
      return failJson('Insufficient permissions.', 403, 'forbidden');
    }
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const parse = facebookDashboardQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parse.success) {
    return failJson(formatZodError(parse.error), 422);
  }

  const { from, to, socialAccountId, auditView } = parse.data;

  try {
    if (auditView === '1') {
      await insertAnalyticsAuditLog({
        userId,
        organizationId: gate.organizationId,
        actionType: 'analytics_viewed',
        message: 'Facebook analytics dashboard opened.',
        metadata: { path: req.nextUrl.pathname },
      });
    }

    const result = await getFacebookAnalyticsDashboardPayload({
      organizationId: gate.organizationId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      socialAccountId,
    });

    return okJson({
      ...result,
      capabilities: {
        export: canExportFacebookAnalytics(gate),
        manageSync: canManageFacebookAnalyticsSync(gate),
      },
    });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'dashboard_failed', 500);
  }
}
