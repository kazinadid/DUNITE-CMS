import { type NextRequest } from 'next/server';

import {
  facebookAnalyticsCapabilities,
  parseSearch,
  resolveFacebookAnalyticsGate,
} from '@/lib/social/facebook/analytics/httpGuards';
import {
  analyticsPostsTableQuerySchema,
  formatZodError,
} from '@/lib/social/facebook/analytics/browserApiSchemas';
import { failJson, okJson } from '@/lib/social/http/apiResponse';
import { fetchLatestAnalyticsRowPerPost } from '@/lib/social/facebook/analyticsDb';

function clampPage(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5000, Math.max(1, Math.floor(n)));
}

function clampPageSize(n: number) {
  if (!Number.isFinite(n)) return 25;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function dayStartMs(d: string) {
  return Date.parse(`${d}T00:00:00.000Z`);
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gateResp = await resolveFacebookAnalyticsGate();
  if (!gateResp.ok) return gateResp.response;

  const qs = parseSearch(req);
  const parse = analyticsPostsTableQuerySchema.safeParse(Object.fromEntries(qs.entries()));
  if (!parse.success) {
    return failJson(formatZodError(parse.error), 422);
  }

  const { from, to, socialAccountId, sort } = parse.data;

  const pageRaw = Number(qs.get('page'));
  const sizeRaw = Number(qs.get('pageSize'));

  const page = clampPage(pageRaw);
  const pageSize = clampPageSize(sizeRaw);

  try {
    const latest = await fetchLatestAnalyticsRowPerPost({
      organizationId: gateResp.gate.organizationId,
    });

    const fromMs = from ? dayStartMs(from) : undefined;
    const toMs = to ? dayStartMs(to) + 86400000 - 1 : undefined;

    const filtered = latest.filter((row) => {
      if (socialAccountId) {
        const acc = (row as { social_account_id?: string }).social_account_id;
        if (typeof acc === 'string' && acc !== socialAccountId) return false;
      }
      const md = row.metric_date ? dayStartMs(row.metric_date) : undefined;
      if (fromMs != null && md != null && md < fromMs) return false;
      if (toMs != null && md != null && md > toMs) return false;
      return true;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'reach':
          return (b.reach ?? 0) - (a.reach ?? 0);
        case 'impressions':
          return (b.impressions ?? 0) - (a.impressions ?? 0);
        case 'metric_date':
          return dayStartMs(b.metric_date ?? '') - dayStartMs(a.metric_date ?? '');
        case 'engagements':
        default:
          return (b.engagements ?? 0) - (a.engagements ?? 0);
      }
    });

    const total = filtered.length;
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

    const items = slice.map((row) => {
      const impressions = Number(row.impressions ?? 0);
      const reach = Number(row.reach ?? 0);
      const engagements = Number(row.engagements ?? 0);
      const er =
        reach > 0 ? Number(((engagements / reach) * 100).toFixed(6)) : null;
      return {
        postId: row.post_id,
        metricDate: row.metric_date,
        impressions,
        reach,
        engagements,
        reactions: Number(row.reactions ?? 0),
        comments_count: Number(row.comments_count ?? 0),
        shares_count: Number(row.shares_count ?? 0),
        clicks: Number(row.clicks ?? 0),
        engagement_rate: row.engagement_rate == null ? er : Number(row.engagement_rate),
        ctr: row.ctr == null ? null : Number(row.ctr),
        synced_at: (row as { synced_at?: string }).synced_at ?? null,
        social_account_id: row.social_account_id ?? null,
      };
    });

    return okJson({
      page,
      pageSize,
      total,
      capabilities: facebookAnalyticsCapabilities(gateResp.gate),
      sort,
      window: from && to ? { from, to } : null,
      items,
    });
  } catch (e: unknown) {
    return failJson(e instanceof Error ? e.message : 'posts_failed', 500);
  }
}
