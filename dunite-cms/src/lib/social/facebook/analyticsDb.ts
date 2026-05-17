import 'server-only';

import { normalizeThrownError } from '@/lib/social/facebook/analytics/normalizeThrownError';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

import type { StoredPostAnalyticsSnapshot } from '@/lib/social/facebook/insights/aggregator';

function throwAnalyticsDb(op: string, err: unknown): never {
  throw new Error(`[analyticsDb] ${op}: ${normalizeThrownError(err).message}`);
}

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
  /** Optional idempotency / trace id written with the snapshot row */
  syncJobId?: string | null;
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
      ...(row.syncJobId ? { sync_job_id: row.syncJobId } : {}),
    },
    { onConflict: 'post_id,metric_date' },
  );

  if (error) throwAnalyticsDb('upsert post', error);
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
  syncJobId?: string | null;
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
      ...(payload.syncJobId ? { sync_job_id: payload.syncJobId } : {}),
    },
    { onConflict: 'social_account_id,metric_date' },
  );
  if (error) throwAnalyticsDb('upsert page', error);
}

export async function listFacebookPageAnalyticsPaged(opts: {
  organizationId: string;
  metricDateStart: string;
  metricDateEnd: string;
  socialAccountId?: string | null;
  limit: number;
  offset: number;
  ascending?: boolean;
}): Promise<{
  rows: Array<Record<string, unknown>>;
  total: number | null;
}> {
  const admin = createSupabaseAdminClient();
  let base = admin
    .from('facebook_page_analytics')
    .select('*', { count: 'exact' })
    .eq('organization_id', opts.organizationId)
    .gte('metric_date', opts.metricDateStart)
    .lte('metric_date', opts.metricDateEnd);

  if (opts.socialAccountId) {
    base = base.eq('social_account_id', opts.socialAccountId);
  }

  const ascending = opts.ascending ?? false;

  base = base
    .order('metric_date', { ascending })
    .order('synced_at', { ascending })
    .range(opts.offset, opts.offset + Math.max(opts.limit - 1, 0));

  const { data, error, count } = await base;
  if (error) throwAnalyticsDb('list page snapshots', error);

  return { rows: (data ?? []) as Record<string, unknown>[], total: count };
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
  if (error) throwAnalyticsDb('list range', error);

  return (data ?? []).map((r) =>
    mapRowToStored(r as unknown as Record<string, unknown>),
  );
}

/** Latest snapshot rows for export + detail merges. */
export async function fetchLatestAnalyticsRowPerPost(opts: {
  organizationId: string;
  postIds?: string[];
}): Promise<Array<StoredPostAnalyticsSnapshot & { synced_at?: string; social_account_id?: string }>> {
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
  if (error) throwAnalyticsDb('latest rows', error);

  const best = new Map<
    string,
    StoredPostAnalyticsSnapshot & { synced_at?: string; social_account_id?: string }
  >();

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
        social_account_id:
          typeof obj.social_account_id === 'string' ? obj.social_account_id : undefined,
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

  if (error) throwAnalyticsDb('list post snapshots', error);

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
  /** Align with Node `finalizeAnalyticsSyncLog` timestamps (avoid DB vs app clock skew). */
  const startedAtIso = new Date().toISOString();
  const { data, error } = await admin
    .from('analytics_sync_logs')
    .insert({
      organization_id: opts.organizationId,
      status:           'running',
      triggered_by:     opts.triggeredBy,
      metadata:         {},
      started_at:       startedAtIso,
    })
    .select('id')
    .single();

  if (error) throwAnalyticsDb('sync log start', error);
  if (!data?.id)
    throw new Error('[analyticsDb] sync log start: missing id');

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

  if (error) throwAnalyticsDb('sync log finalize', error);
}

export async function updatePostFbAnalyticsColumns(opts: {
  postId: string;
  lastSyncedAt: string | null;
  syncingStartedAt?: string | null;
  syncStatus:
    | 'pending'
    | 'syncing'
    | 'synced'
    | 'failed'
    | 'stale'
    | null;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const patch: Record<string, string | null> = {
    fb_analytics_last_synced_at: opts.lastSyncedAt,
    fb_analytics_sync_status:    opts.syncStatus,
  };
  if (opts.syncingStartedAt !== undefined) {
    patch.fb_analytics_syncing_started_at = opts.syncingStartedAt;
  }

  const { error } = await admin.from('posts').update(patch).eq('id', opts.postId);

  if (error) throwAnalyticsDb('post analytics columns', error);
}

export type FacebookAnalyticsQueueJobKind =
  | 'facebook_post_refresh'
  | 'facebook_page_refresh';

export interface FacebookAnalyticsQueueRow {
  id: string;
  organization_id: string;
  job_kind: FacebookAnalyticsQueueJobKind;
  post_id: string | null;
  social_account_id: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
}

export async function enqueueFacebookAnalyticsJob(input: {
  organizationId: string;
  jobKind: FacebookAnalyticsQueueJobKind;
  postId?: string | null;
  socialAccountId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string | null; duplicate: boolean }> {
  const admin = createSupabaseAdminClient();
  const row = {
    organization_id:   input.organizationId,
    job_kind:          input.jobKind,
    post_id:           input.postId ?? null,
    social_account_id: input.socialAccountId ?? null,
    idempotency_key:   input.idempotencyKey,
    metadata:          input.metadata ?? {},
    status:            'pending',
  };

  const { data, error } = await admin
    .from('facebook_analytics_sync_queue')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error?.code === '23505') {
    return { id: null, duplicate: true };
  }
  if (error) throwAnalyticsDb('enqueue job', error);
  return { id: (data?.id as string) ?? null, duplicate: false };
}

export async function claimFacebookAnalyticsSyncJobs(
  batchSize: number,
  runnerId: string,
  lockSeconds = 120,
): Promise<FacebookAnalyticsQueueRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('claim_facebook_analytics_sync_jobs', {
    p_batch_size:    Math.min(200, Math.max(1, batchSize)),
    p_runner_id:     runnerId,
    p_lock_seconds: lockSeconds,
  });

  if (error) throwAnalyticsDb('claim jobs', error);
  return (data ?? []) as unknown as FacebookAnalyticsQueueRow[];
}

export async function completeFacebookAnalyticsJob(opts: {
  jobId: string;
  outcome: 'completed' | 'failed' | 'dead';
  lastError: string | null;
  rescheduleMs?: number;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: loadErr } = await admin
    .from('facebook_analytics_sync_queue')
    .select('retry_count,max_retries')
    .eq('id', opts.jobId)
    .single();

  if (loadErr) throwAnalyticsDb('load job', loadErr);

  const retry = Number(existing.retry_count ?? 0);
  const max = Number(existing.max_retries ?? 6);

  if (opts.outcome === 'completed') {
    const { error } = await admin
      .from('facebook_analytics_sync_queue')
      .update({
        status:               'completed',
        last_error:           null,
        locked_until:         null,
        runner_lock:           null,
        next_attempt_after:   new Date().toISOString(),
      })
      .eq('id', opts.jobId);
    if (error) throwAnalyticsDb('complete job', error);
    return;
  }

  const dead = retry + 1 >= max;
  const backoff = opts.rescheduleMs ?? Math.min(3_600_000, 30_000 * Math.pow(2, retry));
  const next = new Date(Date.now() + backoff).toISOString();

  const { error } = await admin
    .from('facebook_analytics_sync_queue')
    .update(
      dead
        ? {
            status:               'dead',
            last_error:           opts.lastError,
            retry_count:          retry + 1,
            locked_until:         null,
            runner_lock:           null,
            next_attempt_after:   new Date().toISOString(),
          }
        : {
            status:               'pending',
            last_error:           opts.lastError,
            retry_count:          retry + 1,
            locked_until:         null,
            runner_lock:           null,
            next_attempt_after:   next,
          },
    )
    .eq('id', opts.jobId);

  if (error) throwAnalyticsDb('fail job', error);
}

export async function listRecentAnalyticsQueueForOrg(
  organizationId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('facebook_analytics_sync_queue')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throwAnalyticsDb('list queue', error);
  return (data ?? []) as Record<string, unknown>[];
}

export async function listRecentAnalyticsSyncLogs(
  organizationId: string,
  limit = 30,
): Promise<Record<string, unknown>[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('analytics_sync_logs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throwAnalyticsDb('list sync logs', error);
  return (data ?? []) as Record<string, unknown>[];
}
