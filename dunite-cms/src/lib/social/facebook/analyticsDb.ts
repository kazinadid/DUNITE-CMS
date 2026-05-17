import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

import type { StoredPostAnalyticsSnapshot } from '@/lib/social/facebook/insights/aggregator';

export interface FacebookPostAnalyticsInsert {
  organizationId: string;
  postId: string;
  socialAccountId: string | null;
  externalPostId: string;
  impressions: number;
  reach: number;
  engagements: number;
  reactions: number;
  reactionsByType: Record<string, number>;
  commentsCount: number;
  sharesCount: number;
  clicks: number;
  linkClicks: number;
  videoViews: number;
  engagementRate: number | null;
  ctr: number | null;
  metricDate: string;
  syncedAtIso: string;
  rawMetadata: Record<string, unknown>;
}

export function mapRowToStored(r: Record<string, unknown>): StoredPostAnalyticsSnapshot {
  return {
    post_id: typeof r.post_id === 'string' ? r.post_id : undefined,
    metric_date: typeof r.metric_date === 'string' ? r.metric_date : '',
    impressions: Number(r.impressions ?? 0),
    reach: Number(r.reach ?? 0),
    engagements: Number(r.engagements ?? 0),
    reactions: Number(r.reactions ?? 0),
    comments_count: Number(r.comments_count ?? 0),
    shares_count: Number(r.shares_count ?? 0),
    clicks: Number(r.clicks ?? 0),
    engagement_rate: r.engagement_rate == null ? null : Number(r.engagement_rate),
    ctr: r.ctr == null ? null : Number(r.ctr),
  };
}

export async function upsertFacebookPostAnalyticsPayload(
  row: FacebookPostAnalyticsInsert,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from('facebook_post_analytics').upsert(
    {
      organization_id:     row.organizationId,
      post_id:             row.postId,
      social_account_id:   row.socialAccountId,
      external_post_id:    row.externalPostId,
      impressions:         row.impressions,
      reach:               row.reach,
      engagements:         row.engagements,
      reactions:           row.reactions,
      reactions_by_type:   row.reactionsByType,
      comments_count:      row.commentsCount,
      shares_count:        row.sharesCount,
      clicks:              row.clicks,
      link_clicks:         row.linkClicks,
      video_views:         row.videoViews,
      engagement_rate:     row.engagementRate,
      ctr:                 row.ctr,
      metric_date:         row.metricDate,
      synced_at:           row.syncedAtIso,
      raw_metadata:        row.rawMetadata,
    },
    { onConflict: 'post_id,metric_date' },
  );

  if (error) throw new Error(`[analyticsDb] upsert post: ${error.message}`);
}

export async function upsertFacebookPageAnalyticsPayload(payload: {
  organizationId: string;
  socialAccountId: string;
  metricDate: string;
  impressions: number;
  reach: number;
  engagements: number;
  clicks: number;
  linkClicks: number;
  videoViews: number;
  ctr: number | null;
  rawMetadata: Record<string, unknown>;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('facebook_page_analytics').upsert(
    {
      organization_id:   payload.organizationId,
      social_account_id: payload.socialAccountId,
      impressions:       payload.impressions,
      reach:             payload.reach,
      engagements:       payload.engagements,
      clicks:            payload.clicks,
      link_clicks:       payload.linkClicks,
      video_views:       payload.videoViews,
      ctr:               payload.ctr,
      metric_date:       payload.metricDate,
      synced_at:         new Date().toISOString(),
      raw_metadata:      payload.rawMetadata,
    },
    { onConflict: 'social_account_id,metric_date' },
  );
  if (error) throw new Error(`[analyticsDb] upsert page: ${error.message}`);
}

export async function listFacebookPostAnalyticsRange(opts: {
  organizationId: string;
  startDate: string;
  endDate: string;
  socialAccountId?: string | null | undefined;
}): Promise<StoredPostAnalyticsSnapshot[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from('facebook_post_analytics')
    .select(
      'post_id, metric_date, impressions, reach, engagements, reactions, comments_count, shares_count, clicks, engagement_rate, ctr',
    )
    .eq('organization_id', opts.organizationId)
    .gte('metric_date', opts.startDate)
    .lte('metric_date', opts.endDate)
    .order('metric_date', { ascending: true });

  if (opts.socialAccountId) {
    q = q.eq('social_account_id', opts.socialAccountId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`[analyticsDb] list range: ${error.message}`);

  return (data ?? []).map((r) =>
    mapRowToStored(r as unknown as Record<string, unknown>),
  );
}

/** Latest snapshot rows for export + detail merges. */
export async function fetchLatestAnalyticsRowPerPost(opts: {
  organizationId: string;
  postIds?: string[];
}): Promise<Array<StoredPostAnalyticsSnapshot & { synced_at?: string }>> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from('facebook_post_analytics')
    .select(
      'post_id, metric_date, impressions, reach, engagements, reactions, comments_count, shares_count, clicks, engagement_rate, ctr, synced_at, external_post_id, social_account_id',
    )
    .eq('organization_id', opts.organizationId)
    .order('metric_date', { ascending: false });

  if (opts.postIds?.length) {
    q = q.in('post_id', opts.postIds);
  }

  const { data, error } = await q;
  if (error) throw new Error(`[analyticsDb] latest rows: ${error.message}`);

  const best = new Map<string, StoredPostAnalyticsSnapshot & { synced_at?: string }>();

  const safeParse = (d: string) => Date.parse(`${d}T12:00:00Z`);

  for (const raw of data ?? []) {
    const obj = raw as Record<string, unknown>;
    const row = mapRowToStored(obj);
    const pid = typeof obj.post_id === 'string' ? obj.post_id : row.post_id;
    if (!pid) continue;

    const prev = best.get(pid);
    const replace =
      !prev || safeParse(row.metric_date) >= safeParse(prev.metric_date ?? '');
    if (replace) {
      best.set(pid, {
        ...row,
        post_id: pid,
        synced_at: typeof obj.synced_at === 'string' ? obj.synced_at : undefined,
      });
    }
  }

  return [...best.values()];
}

export async function listPostAnalyticsDescending(opts: {
  organizationId: string;
  postId: string;
}): Promise<
  Array<
    StoredPostAnalyticsSnapshot & {
      synced_at?: string;
      reactions_by_type?: Record<string, number> | null;
      link_clicks?: number;
      video_views?: number;
    }
  >
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('facebook_post_analytics')
    .select(
      'post_id, metric_date, impressions, reach, engagements, reactions, reactions_by_type, comments_count, shares_count, clicks, link_clicks, video_views, engagement_rate, ctr, synced_at',
    )
    .eq('organization_id', opts.organizationId)
    .eq('post_id', opts.postId)
    .order('metric_date', { ascending: false });

  if (error) throw new Error(`[analyticsDb] list post snapshots: ${error.message}`);

  return (data ?? []).map((raw) => {
    const obj = raw as Record<string, unknown>;
    return {
      ...mapRowToStored(obj),
      post_id: typeof obj.post_id === 'string' ? obj.post_id : undefined,
      synced_at: typeof obj.synced_at === 'string' ? obj.synced_at : undefined,
      reactions_by_type:
        obj.reactions_by_type && typeof obj.reactions_by_type === 'object'
          ? (obj.reactions_by_type as Record<string, number>)
          : null,
      link_clicks:
        obj.link_clicks == null ? undefined : Number(obj.link_clicks ?? 0),
      video_views:
        obj.video_views == null ? undefined : Number(obj.video_views ?? 0),
    };
  });
}

export async function startAnalyticsSyncLog(opts: {
  organizationId: string | null;
  triggeredBy: 'cron' | 'manual' | 'worker';
}): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('analytics_sync_logs')
    .insert({
      organization_id: opts.organizationId,
      status:           'running',
      triggered_by:     opts.triggeredBy,
      metadata:         {},
    })
    .select('id')
    .single();

  if (error || !data?.id) throw new Error(`[analyticsDb] sync log start: ${error?.message}`);
  return data.id as string;
}

export async function finalizeAnalyticsSyncLog(opts: {
  id: string;
  status: 'completed' | 'failed';
  attempted: number;
  succeeded: number;
  apiCallsApprox: number;
  errorSummary: string | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('analytics_sync_logs')
    .update({
      status:           opts.status,
      completed_at:     new Date().toISOString(),
      posts_attempted:  opts.attempted,
      posts_succeeded:  opts.succeeded,
      api_calls_approx: opts.apiCallsApprox,
      error_summary:    opts.errorSummary,
    })
    .eq('id', opts.id);

  if (error) throw new Error(`[analyticsDb] sync log finalize: ${error.message}`);
}

export async function updatePostFbAnalyticsColumns(opts: {
  postId: string;
  lastSyncedAt: string | null;
  syncStatus:
    | 'pending'
    | 'syncing'
    | 'synced'
    | 'failed'
    | 'stale'
    | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('posts')
    .update({
      fb_analytics_last_synced_at: opts.lastSyncedAt,
      fb_analytics_sync_status:    opts.syncStatus,
    })
    .eq('id', opts.postId);

  if (error) throw new Error(`[analyticsDb] post analytics columns: ${error.message}`);
}
