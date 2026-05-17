import type { ReactionBreakdown } from './types';

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Prefer the latest period bucket when Facebook returns a series. */
function latestMetricValue(metric: { name: string; values: { value?: unknown }[] }): number {
  const values = metric.values ?? [];
  if (values.length === 0) return 0;
  const last = values[values.length - 1];
  return toNumber(last?.value ?? 0);
}

const INSIGHT_TOTALS_ORDER = ['post_engagements', 'post_impressions'];

export interface RawInsightsBundle {
  insights: { name: string; values: { value?: unknown }[] }[];
  shares: number;
  commentsFromSummary: number;
  reactionsTotal: number;
  reactionsByType: ReactionBreakdown;
  rawInsights: Record<string, unknown>;
  rawSummary: Record<string, unknown>;
}

export interface NormalizedPostMetrics extends RawInsightsBundle {
  impressions: number;
  reach: number;
  engagements: number;
  reactions: number;
  comments_count: number;
  shares_count: number;
  clicks: number;
  link_clicks: number;
  video_views: number;
  engagement_rate: number | null;
  ctr: number | null;
}

function pickNamed(
  insights: RawInsightsBundle['insights'],
  name: string,
): number {
  const row = insights.find((m) => m.name === name);
  return row ? latestMetricValue(row) : 0;
}

/** Build safe JSON metadata for persistence (omit tokens — caller responsibility). */
export function buildRawMetadata(bundle: RawInsightsBundle): Record<string, unknown> {
  return {
    impressions_breakdown_present: INSIGHT_TOTALS_ORDER.some((n) =>
      bundle.insights.some((x) => x.name === n),
    ),
    provider_insight_names: bundle.insights.map((m) => m.name),
    summary_keys: Object.keys(bundle.rawSummary),
  };
}

/**
 * Consolidates Insights rows + `/post` summaries into canonical numeric metrics.
 */
export function normalizeFacebookPostInsights(bundle: RawInsightsBundle): NormalizedPostMetrics {
  let impressions =
    pickNamed(bundle.insights, 'post_impressions') ||
    pickNamed(bundle.insights, 'post_impressions_organic') ||
    pickNamed(bundle.insights, 'post_impressions_paid');
  let reach =
    pickNamed(bundle.insights, 'post_impressions_unique') ||
    pickNamed(bundle.insights, 'post_views_organic_unique');
  let engagements =
    pickNamed(bundle.insights, 'post_engagements') ||
    pickNamed(bundle.insights, 'post_engaged_users');

  /** Derive engagements from observable summary signals when Insights returns zero. */
  const summaryFloor =
    bundle.reactionsTotal + bundle.commentsFromSummary + (bundle.shares || 0);
  if (!engagements && summaryFloor > 0) engagements = summaryFloor;

  /** Impressions heuristic when metrics hidden by permissions — never invent large numbers */
  if (!impressions && reach > 0) impressions = reach;
  if (!reach && impressions > 0) reach = impressions;

  const clicks =
    pickNamed(bundle.insights, 'post_clicks') ||
    pickNamed(bundle.insights, 'post_engaged_fan') ||
    pickNamed(bundle.insights, 'post_consumptions');
  const link_clicks =
    pickNamed(bundle.insights, 'post_link_clicks') ||
    pickNamed(bundle.insights, 'post_clicks_by_type_link_clicks');
  const video_views =
    pickNamed(bundle.insights, 'post_video_views') ||
    pickNamed(bundle.insights, 'post_video_views_unique');

  const reactionsSum =
    bundle.reactionsTotal ||
    pickNamed(bundle.insights, 'post_reactions_by_type_total') ||
    pickNamed(bundle.insights, 'post_reactions_like_total');
  const comments_count =
    bundle.commentsFromSummary ||
    pickNamed(bundle.insights, 'post_story_adds_by_story_type_feedback_comment');
  const shares_count =
    bundle.shares || pickNamed(bundle.insights, 'post_engagements_shares_or_reactions_comments');

  const engagement_rate =
    reach > 0 ? Number(((engagements / reach) * 100).toFixed(6)) : null;
  const ctr =
    impressions > 0 ? Number((((link_clicks || clicks) / impressions) * 100).toFixed(6)) : null;

  return {
    ...bundle,
    impressions,
    reach,
    engagements,
    reactions: reactionsSum,
    reactionsTotal: reactionsSum,
    reactionsByType: bundle.reactionsByType,
    comments_count,
    shares_count,
    clicks,
    link_clicks,
    video_views,
    engagement_rate,
    ctr,
  };
}

/** Page Insights (`/{page-id}/insights`) use different metric identifiers. */
export function normalizeFacebookPageInsights(bundle: RawInsightsBundle): NormalizedPostMetrics {
  const impressions =
    pickNamed(bundle.insights, 'page_impressions') ||
    pickNamed(bundle.insights, 'page_posts_impressions') ||
    0;
  const reach =
    pickNamed(bundle.insights, 'page_impressions_unique') ||
    pickNamed(bundle.insights, 'page_views_total') ||
    impressions;
  const engagements =
    pickNamed(bundle.insights, 'page_post_engagements') ||
    pickNamed(bundle.insights, 'page_engaged_users') ||
    0;

  const clicksRaw =
    pickNamed(bundle.insights, 'page_clicked') ||
    pickNamed(bundle.insights, 'page_cta_clicks_logged_in_total') ||
    pickNamed(bundle.insights, 'page_clicks_by_link_clicks_logged_out_unique');
  const clicks = clicksRaw || 0;

  const link_clicks =
    pickNamed(bundle.insights, 'page_clicks_by_link_clicks_logged_out_unique') || clicks;

  const video_views = pickNamed(bundle.insights, 'page_video_views') || 0;

  const engagement_rate =
    reach > 0 ? Number(((engagements / reach) * 100).toFixed(6)) : null;
  const safeCtr =
    impressions > 0
      ? Number((((link_clicks || clicks || 0) / impressions) * 100).toFixed(6))
      : null;

  return {
    ...bundle,
    impressions,
    reach,
    engagements,
    reactions: 0,
    reactionsTotal: 0,
    reactionsByType: {},
    comments_count: 0,
    shares_count: 0,
    clicks,
    link_clicks,
    video_views,
    engagement_rate,
    ctr: safeCtr,
  };
}

export function coerceReactionsBreakdown(input: unknown): ReactionBreakdown {
  if (!input || typeof input !== 'object') return {};
  const out: ReactionBreakdown = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const n = toNumber(v);
    if (n) out[k] = n;
  }
  return out;
}
