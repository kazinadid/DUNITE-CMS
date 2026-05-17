/**
 * Typed contracts for stored Facebook snapshots and dashboard aggregation.
 */

export type FacebookAnalyticsSyncGateStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'stale';

export interface AnalyticsMetric {
  key:
    | 'impressions'
    | 'reach'
    | 'engagements'
    | 'reactions'
    | 'comments'
    | 'shares'
    | 'clicks'
    | 'link_clicks'
    | 'video_views'
    | 'engagement_rate'
    | 'ctr';
  value: number | null;
  label: string;
}

export interface ReactionBreakdown {
  like?: number;
  love?: number;
  wow?: number;
  haha?: number;
  sorry?: number;
  anger?: number;
  /** Other provider-specific buckets */
  [k: string]: number | undefined;
}

export interface PostInsights {
  postId: string;
  externalPostId: string;
  socialAccountId: string | null;
  syncedAtIso: string;
  metricDate: string;
  impressions: number;
  reach: number;
  engagements: number;
  reactionsTotal: number;
  reactionsByType: ReactionBreakdown;
  commentsCount: number;
  sharesCount: number;
  clicks: number;
  linkClicks: number;
  videoViews: number;
  engagementRate: number | null;
  ctr: number | null;
  series: InsightTimePoint[];
}

export interface InsightTimePoint {
  metricDate: string;
  impressions: number;
  reach: number;
  engagements: number;
}

export interface EngagementSummary {
  totalEngagements: number;
  totalImpressions: number;
  avgEngagementRate: number | null;
  avgCtr: number | null;
}

export interface DashboardAnalytics {
  range: {
    from: string;
    to: string;
  };
  summary: EngagementSummary & {
    totalReach: number;
    totalReactions: number;
    totalShares: number;
    totalComments: number;
    totalClicks: number;
    totalPostsWithData: number;
  };
  engagementSeries: InsightTimePoint[];
  impressionsSeries: InsightTimePoint[];
  topPosts: DashboardPostChip[];
  recentPublished: DashboardPostChip[];
  failedPosts: DashboardPostChip[];
  accounts: DashboardAccountChip[];
}

export interface DashboardPostChip {
  postId: string;
  excerpt: string;
  impressions: number;
  reach: number;
  engagements: number;
  publishedAtIso: string | null;
}

export interface DashboardAccountChip {
  id: string;
  label: string;
}

export type AnalyticsSyncStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface ExportRequestQuery {
  format: 'csv' | 'json';
  from?: string | undefined;
  to?: string | undefined;
  socialAccountId?: string | undefined;
  includeTotals?: boolean | undefined;
}
