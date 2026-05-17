import 'server-only';

import type { DashboardAnalytics, DashboardPostChip, InsightTimePoint } from './types';

export interface StoredPostAnalyticsSnapshot {
  post_id?: string | undefined;
  metric_date: string;
  impressions: number;
  reach: number;
  engagements: number;
  reactions: number;
  comments_count: number;
  shares_count: number;
  clicks: number;
  engagement_rate?: number | null | undefined;
  ctr: number | null;
}

/** Merge rows into chronological series (UTC-safe sort). */
export function buildEngagementAndImpressionsSeries(rows: StoredPostAnalyticsSnapshot[]): {
  engagementSeries: InsightTimePoint[];
  impressionsSeries: InsightTimePoint[];
} {
  const sorted = [...rows].sort(
    (a, b) =>
      Date.parse(`${a.metric_date}T12:00:00Z`) -
      Date.parse(`${b.metric_date}T12:00:00Z`),
  );

  const engagementSeries = sorted.map((r) => ({
    metricDate: r.metric_date,
    impressions: r.impressions,
    reach: r.reach,
    engagements: r.engagements,
  }));

  return { engagementSeries, impressionsSeries: [...engagementSeries] };
}

type SnapLatest = StoredPostAnalyticsSnapshot & { postId: string };

export function pickTopPostsByEngagement(
  latestByPost: Map<string, SnapLatest>,
  contentByPost: Map<string, { content: string; published_at: string | null }>,
  limit: number,
): DashboardPostChip[] {
  return [...latestByPost.values()]
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, limit)
    .map((snap) => {
      const meta = contentByPost.get(snap.postId);
      return {
        postId: snap.postId,
        excerpt: (meta?.content ?? '').slice(0, 120),
        impressions: snap.impressions,
        reach: snap.reach,
        engagements: snap.engagements,
        publishedAtIso: meta?.published_at ?? null,
      };
    });
}

export function latestSnapshotPerPost(
  rows: StoredPostAnalyticsSnapshot[],
): StoredPostAnalyticsSnapshot[] {
  const map = new Map<string, StoredPostAnalyticsSnapshot>();

  const safeParse = (d: string) => Date.parse(`${d}T12:00:00Z`);

  for (const r of rows) {
    const pid = r.post_id;
    if (!pid) continue;
    const prev = map.get(pid);
    if (
      !prev ||
      safeParse(r.metric_date) >= safeParse(prev.metric_date)
    ) {
      map.set(pid, r);
    }
  }

  return [...map.values()];
}

export function rollupDashboardTotals(rowsForLatestPerPost: StoredPostAnalyticsSnapshot[]): {
  totalReachAcrossPosts: number;
  totalImpressionsAcrossPosts: number;
  totalEngagementsAcrossSeries: number;
  totalReactionsAcrossSeries: number;
  totalSharesAcrossSeries: number;
  totalCommentsAcrossSeries: number;
  totalClicksAcrossSeries: number;
  /** Derived from newest snapshot row per CMS post inside the aggregation input. */
  latestSnapByPostEngagements: Map<string, StoredPostAnalyticsSnapshot>;
  avgPostEngagementRate: number | null;
  avgPostCtr: number | null;
} {
  let totalReachAcrossPosts = 0;
  let totalImpressionsAcrossPosts = 0;
  let totalEngagementsAcrossSeries = 0;
  let totalReactionsAcrossSeries = 0;
  let totalSharesAcrossSeries = 0;
  let totalCommentsAcrossSeries = 0;
  let totalClicksAcrossSeries = 0;

  const latestSnapByPost = new Map<string, StoredPostAnalyticsSnapshot>();

  for (const r of rowsForLatestPerPost) {
    totalReachAcrossPosts += r.reach;
    totalImpressionsAcrossPosts += r.impressions;
    totalEngagementsAcrossSeries += r.engagements;
    totalReactionsAcrossSeries += r.reactions;
    totalSharesAcrossSeries += r.shares_count;
    totalCommentsAcrossSeries += r.comments_count;
    totalClicksAcrossSeries += r.clicks;

    const pid = r.post_id ?? '';
    if (!pid) continue;
    latestSnapByPost.set(pid, r);
  }

  let erSum = 0;
  let erCount = 0;
  let ctrSum = 0;
  let ctrCount = 0;
  for (const snap of latestSnapByPost.values()) {
    if (snap.reach > 0) {
      erSum += snap.engagements / snap.reach;
      erCount++;
    }
    if (snap.ctr != null && Number.isFinite(snap.ctr)) {
      ctrSum += snap.ctr;
      ctrCount++;
    }
  }

  return {
    totalReachAcrossPosts,
    totalImpressionsAcrossPosts,
    totalEngagementsAcrossSeries,
    totalReactionsAcrossSeries,
    totalSharesAcrossSeries,
    totalCommentsAcrossSeries,
    totalClicksAcrossSeries,
    latestSnapByPostEngagements: latestSnapByPost,
    avgPostEngagementRate:
      erCount > 0 ? Number(((erSum / erCount) * 100).toFixed(6)) : null,
    avgPostCtr:
      ctrCount > 0 ? Number((ctrSum / ctrCount).toFixed(6)) : null,
  };
}

export function consolidateSeriesByMetricDate(
  rows: StoredPostAnalyticsSnapshot[],
): StoredPostAnalyticsSnapshot[] {
  const accum = new Map<
    string,
    {
      impressions: number;
      reach: number;
      engagements: number;
      reactions: number;
      comments: number;
      shares: number;
      clicks: number;
    }
  >();

  for (const r of rows) {
    const cur =
      accum.get(r.metric_date) ?? {
        impressions: 0,
        reach: 0,
        engagements: 0,
        reactions: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
      };
    cur.impressions += r.impressions;
    cur.reach += r.reach;
    cur.engagements += r.engagements;
    cur.reactions += r.reactions;
    cur.comments += r.comments_count;
    cur.shares += r.shares_count;
    cur.clicks += r.clicks;
    accum.set(r.metric_date, cur);
  }

  return [...accum.entries()]
    .map(([metric_date, v]) => ({
      metric_date,
      impressions: v.impressions,
      reach: v.reach,
      engagements: v.engagements,
      reactions: v.reactions,
      comments_count: v.comments,
      shares_count: v.shares,
      clicks: v.clicks,
      ctr:
        v.impressions > 0 ? Number((((v.clicks || 0) / v.impressions) * 100).toFixed(6)) : null,
      engagement_rate:
        v.reach > 0 ? Number(((v.engagements / v.reach) * 100).toFixed(6)) : null,
    }))
    .sort(
      (a, b) =>
        Date.parse(`${a.metric_date}T12:00:00Z`) -
        Date.parse(`${b.metric_date}T12:00:00Z`),
    );
}

export function assembleDashboardOverview(params: {
  from: string;
  to: string;
  seriesRows: StoredPostAnalyticsSnapshot[];
  rollupRowsAllDays: StoredPostAnalyticsSnapshot[];
  contentByPost: Map<string, { content: string; published_at: string | null }>;
  recentPublished: DashboardPostChip[];
  failedPosts: DashboardPostChip[];
  accounts: DashboardAnalytics['accounts'];
}): DashboardAnalytics {
  const latestRows = latestSnapshotPerPost(params.rollupRowsAllDays);
  const totals = rollupDashboardTotals(latestRows);
  const { engagementSeries, impressionsSeries } = buildEngagementAndImpressionsSeries(
    params.seriesRows,
  );

  const snapLatestMap = new Map<string, SnapLatest>();
  for (const [pid, snap] of totals.latestSnapByPostEngagements.entries()) {
    snapLatestMap.set(pid, { ...snap, postId: pid });
  }

  const topPosts = pickTopPostsByEngagement(snapLatestMap, params.contentByPost, 8);

  /** KPI cards compare latest snapshot engagement totals (not summed days). */
  let latestAggEngagements = 0;
  let latestAggReactions = 0;
  let latestShares = 0;
  let latestComments = 0;
  let latestClicks = 0;
  for (const snap of totals.latestSnapByPostEngagements.values()) {
    latestAggEngagements += snap.engagements;
    latestAggReactions += snap.reactions;
    latestShares += snap.shares_count;
    latestComments += snap.comments_count;
    latestClicks += snap.clicks;
  }

  return {
    range: { from: params.from, to: params.to },
    summary: {
      totalReach: totals.totalReachAcrossPosts,
      totalImpressions: totals.totalImpressionsAcrossPosts,
      avgEngagementRate: totals.avgPostEngagementRate,
      avgCtr: totals.avgPostCtr,
      totalEngagements: latestAggEngagements,
      totalReactions: latestAggReactions,
      totalShares: latestShares,
      totalComments: latestComments,
      totalClicks: latestClicks,
      totalPostsWithData: totals.latestSnapByPostEngagements.size,
    },
    engagementSeries,
    impressionsSeries,
    topPosts,
    recentPublished: params.recentPublished.slice(0, 10),
    failedPosts: params.failedPosts.slice(0, 15),
    accounts: params.accounts,
  };
}

export function aggregateAnalytics(rows: StoredPostAnalyticsSnapshot[]) {
  return rollupDashboardTotals(latestSnapshotPerPost(rows));
}
