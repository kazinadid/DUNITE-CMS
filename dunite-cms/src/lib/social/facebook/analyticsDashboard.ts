import 'server-only';

import { listSocialAccountsByOrg } from '@/features/integrations/server/socialAccountsRepository';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assembleDashboardOverview, consolidateSeriesByMetricDate } from '@/lib/social/facebook/insights/aggregator';
import { listFacebookPostAnalyticsRange } from '@/lib/social/facebook/analyticsDb';
import type { DashboardAnalytics, DashboardPostChip } from '@/lib/social/facebook/insights/types';
import {
  getAnalyticsDashboardCached,
  refreshAnalyticsCache,
  setAnalyticsDashboardCached,
} from '@/lib/social/facebook/insights/cache';

function defaultRange(days = 14): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function latestSnapshotForPost(
  rows: {
    post_id?: string | undefined;
    metric_date?: string | undefined;
    impressions: number;
    reach: number;
    engagements: number;
  }[],
  postId: string,
) {
  const mine = rows.filter((r) => r.post_id === postId);
  if (!mine.length) return null;
  return mine.sort(
    (a, b) =>
      Date.parse(`${b.metric_date ?? ''}T12:00:00Z`) -
      Date.parse(`${a.metric_date ?? ''}T12:00:00Z`),
  )[0];
}

export async function getFacebookAnalyticsDashboardPayload(opts: {
  organizationId: string;
  from?: string | undefined;
  to?: string | undefined;
  socialAccountId?: string | null | undefined;
  invalidateCache?: boolean | undefined;
}): Promise<{ dashboard: DashboardAnalytics; cached: boolean }> {
  const range = opts.from && opts.to ? { from: opts.from, to: opts.to } : defaultRange(14);

  const queryToken = [range.from, range.to, opts.socialAccountId ?? ''].join('|');

  if (opts.invalidateCache) {
    refreshAnalyticsCache(opts.organizationId);
  }

  const cached = getAnalyticsDashboardCached({
    organizationId: opts.organizationId,
    queryToken,
  });

  if (cached) return { dashboard: cached, cached: true };

  const rowsRaw = await listFacebookPostAnalyticsRange({
    organizationId: opts.organizationId,
    startDate: range.from,
    endDate: range.to,
    socialAccountId: opts.socialAccountId,
  });

  const seriesRows = consolidateSeriesByMetricDate(rowsRaw);

  const admin = createSupabaseAdminClient();
  const postIds = [...new Set(rowsRaw.map((r) => r.post_id).filter(Boolean) as string[])];

  const contentByPost = new Map<
    string,
    { content: string; published_at: string | null }
  >();

  if (postIds.length > 0) {
    const { data: excerpts } = await admin
      .from('posts')
      .select('id, content, published_at')
      .in('id', postIds);
    for (const row of excerpts ?? []) {
      const r = row as { id?: string; content?: string; published_at?: string | null };
      if (typeof r.id === 'string')
        contentByPost.set(r.id, {
          content: r.content ?? '',
          published_at: r.published_at ?? null,
        });
    }
  }

  const [{ data: recentRows }, { data: failedRows }] = await Promise.all([
    admin
      .from('posts')
      .select('id, content, published_at')
      .eq('organization_id', opts.organizationId)
      .not('external_post_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(10),
    admin
      .from('posts')
      .select('id, content, published_at')
      .eq('organization_id', opts.organizationId)
      .in('status', ['failed', 'retrying'])
      .order('updated_at', { ascending: false })
      .limit(15),
  ]);

  const recentPublished: DashboardPostChip[] =
    recentRows?.map((p) => {
      const r = p as { id: string; content: string; published_at?: string | null };
      const snap = latestSnapshotForPost(rowsRaw, r.id);
      return {
        postId: r.id,
        excerpt: (r.content ?? '').slice(0, 120),
        impressions: snap?.impressions ?? 0,
        reach: snap?.reach ?? 0,
        engagements: snap?.engagements ?? 0,
        publishedAtIso: r.published_at ?? null,
      };
    }) ?? [];

  const failedPosts: DashboardPostChip[] =
    failedRows?.map((p) => {
      const r = p as { id: string; content: string; published_at?: string | null };
      return {
        postId: r.id,
        excerpt: (r.content ?? '').slice(0, 120),
        impressions: 0,
        reach: 0,
        engagements: 0,
        publishedAtIso: r.published_at ?? null,
      };
    }) ?? [];

  const accountsSnap = await listSocialAccountsByOrg(opts.organizationId, 'facebook');
  const dashboard = assembleDashboardOverview({
    from: range.from,
    to: range.to,
    seriesRows,
    rollupRowsAllDays: rowsRaw,
    contentByPost,
    recentPublished,
    failedPosts,
    accounts: accountsSnap.map((a) => ({
      id: a.id,
      label: a.external_name ?? a.external_id,
    })),
  });

  setAnalyticsDashboardCached(
    { organizationId: opts.organizationId, queryToken },
    dashboard,
  );

  return { dashboard, cached: false };
}
