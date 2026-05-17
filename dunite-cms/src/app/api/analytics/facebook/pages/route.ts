import { type NextRequest } from 'next/server';

import {
  facebookAnalyticsCapabilities,
  parseSearch,
  resolveFacebookAnalyticsGate,
} from '@/lib/social/facebook/analytics/httpGuards';
import {
  analyticsPagesTableQuerySchema,
  formatZodError,
} from '@/lib/social/facebook/analytics/browserApiSchemas';
import { listFacebookPageAnalyticsPaged } from '@/lib/social/facebook/analyticsDb';
import { failJson, okJson } from '@/lib/social/http/apiResponse';

function clampPage(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5000, Math.max(1, Math.floor(n)));
}

function clampPageSize(n: number) {
  if (!Number.isFinite(n)) return 25;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gateResp = await resolveFacebookAnalyticsGate();
  if (!gateResp.ok) return gateResp.response;

  const qs = parseSearch(req);
  const parse = analyticsPagesTableQuerySchema.safeParse(Object.fromEntries(qs.entries()));
  if (!parse.success) {
    return failJson(formatZodError(parse.error), 422);
  }

  const { from, to, socialAccountId, sortDir } = parse.data;
  const page = clampPage(Number(qs.get('page')));
  const pageSize = clampPageSize(Number(qs.get('pageSize')));
  const offset = (page - 1) * pageSize;

  try {
    const bundle = await listFacebookPageAnalyticsPaged({
      organizationId:    gateResp.gate.organizationId,
      metricDateStart:   from,
      metricDateEnd:     to,
      socialAccountId:   socialAccountId ?? null,
      limit:             pageSize,
      offset,
      ascending:         sortDir === 'asc',
    });

    const items = bundle.rows.map((raw) => {
      const impressions = Number(raw.impressions ?? 0);
      const reach = Number(raw.reach ?? 0);
      const engagements = Number(raw.engagements ?? 0);
      const er =
        reach > 0 ? Number(((engagements / reach) * 100).toFixed(6)) : null;

      const ctrStored = raw.ctr == null ? null : Number(raw.ctr);
      const linkClicks =
        raw.link_clicks == null ? 0 : Number(raw.link_clicks ?? 0);
      const ctr =
        ctrStored != null && Number.isFinite(ctrStored)
          ? ctrStored
          : impressions > 0 && linkClicks > 0
            ? Number(((linkClicks / impressions) * 100).toFixed(6))
            : null;

      return {
        socialAccountId:
          typeof raw.social_account_id === 'string'
            ? raw.social_account_id
            : '',
        metricDate:
          typeof raw.metric_date === 'string' ? raw.metric_date : null,
        impressions,
        reach,
        engagements,
        clicks:     Number(raw.clicks ?? 0),
        linkClicks,
        videoViews: Number(raw.video_views ?? 0),
        ctr,
        engagement_rate_hint: er,
        synced_at: typeof raw.synced_at === 'string' ? raw.synced_at : null,
      };
    });

    return okJson({
      page,
      pageSize,
      total: bundle.total ?? items.length,
      sortDir,
      window: { from, to },
      capabilities: facebookAnalyticsCapabilities(gateResp.gate),
      items,
    });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'pages_failed', 500);
  }
}
