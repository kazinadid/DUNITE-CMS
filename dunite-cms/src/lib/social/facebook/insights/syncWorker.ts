import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { allowFacebookGraphCall } from '@/lib/social/shared/orgFacebookRateLimit';
import {
  insertAnalyticsAuditLog,
  resolveOrganizationAuditUser,
} from '@/lib/activity/analyticsAudit';
import {
  upsertFacebookPageAnalyticsPayload,
  upsertFacebookPostAnalyticsPayload,
  updatePostFbAnalyticsColumns,
  startAnalyticsSyncLog,
  finalizeAnalyticsSyncLog,
} from '@/lib/social/facebook/analyticsDb';
import { buildRawMetadata } from '@/lib/social/facebook/insights/transformer';
import type { RawInsightsBundle } from '@/lib/social/facebook/insights/transformer';
import { fetchPostInsightsBundle, fetchPageInsightsBundle } from '@/lib/social/facebook/insights/fetcher';
import type { NormalizedPostMetrics } from '@/lib/social/facebook/insights/transformer';
import { FacebookInsightsError } from '@/lib/social/facebook/insights/errors';

function utcMetricDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function metricsToPersistenceMeta(m: NormalizedPostMetrics): Record<string, unknown> {
  const bundle: RawInsightsBundle = {
    insights:           m.insights,
    shares:             m.shares,
    commentsFromSummary: m.commentsFromSummary,
    reactionsTotal:     m.reactionsTotal,
    reactionsByType:    m.reactionsByType,
    rawInsights:        m.rawInsights,
    rawSummary:         m.rawSummary,
  };

  const safe = buildRawMetadata(bundle);
  const engagement_rate = m.engagement_rate;
  const ctr = m.ctr;
  return {
    ...safe,
    engagement_rate_hint: engagement_rate,
    ctr_hint: ctr,
  };
}

/**
 * Persist a normalized metrics bundle for today's UTC calendar row.
 */
export async function syncPostAnalytics(params: {
  organizationId: string;
  postId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();

  const { data: post, error: pe } = await admin
    .from('posts')
    .select('id, organization_id, external_post_id, social_account_id, status')
    .eq('id', params.postId)
    .maybeSingle();

  if (pe || !post?.external_post_id || !post.social_account_id) {
    return {
      ok: false,
      error: 'Post is missing outbound Facebook linkage for analytics.',
    };
  }

  if (post.organization_id && post.organization_id !== params.organizationId) {
    return { ok: false, error: 'Organization mismatch.' };
  }

  if (!allowFacebookGraphCall(params.organizationId)) {
    return { ok: false, error: 'Hourly Graph budget exhausted for workspace.' };
  }

  await updatePostFbAnalyticsColumns({
    postId: params.postId,
    lastSyncedAt: null,
    syncStatus: 'syncing',
  });

  try {
    const normalized = await fetchPostInsightsBundle({
      socialAccountId: post.social_account_id as string,
      externalPostId: post.external_post_id as string,
    });

    const syncedAt = new Date().toISOString();
    await upsertFacebookPostAnalyticsPayload({
      organizationId: params.organizationId,
      postId: params.postId,
      socialAccountId: post.social_account_id as string,
      externalPostId: post.external_post_id as string,
      impressions: normalized.impressions,
      reach: normalized.reach,
      engagements: normalized.engagements,
      reactions: normalized.reactions,
      reactionsByType: normalized.reactionsByType as Record<string, number>,
      commentsCount: normalized.comments_count,
      sharesCount: normalized.shares_count,
      clicks: normalized.clicks,
      linkClicks: normalized.link_clicks,
      videoViews: normalized.video_views,
      engagementRate: normalized.engagement_rate,
      ctr: normalized.ctr,
      metricDate: utcMetricDate(),
      syncedAtIso: syncedAt,
      rawMetadata: metricsToPersistenceMeta(normalized),
    });

    await updatePostFbAnalyticsColumns({
      postId: params.postId,
      lastSyncedAt: syncedAt,
      syncStatus: 'synced',
    });

    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof FacebookInsightsError ? e.message : (e instanceof Error ? e.message : 'sync_failed');
    await updatePostFbAnalyticsColumns({
      postId: params.postId,
      lastSyncedAt: null,
      syncStatus: 'failed',
    });
    return { ok: false, error: msg };
  }
}

/**
 * Processes a bounded backlog of outbound Facebook posts lacking fresh analytics snapshots.
 */
export async function syncOrganizationAnalytics(options?: {
  /** When provided, restricts work to posts for this tenant. */
  organizationId?: string | null | undefined;
  /** Hard cap across all orgs unless org filter set. */
  maxPosts?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  failures: number;
  apiCallsApprox: number;
}> {
  const admin = createSupabaseAdminClient();
  const maxPosts = Math.min(80, Math.max(1, options?.maxPosts ?? 25));
  const orgFilter = options?.organizationId;

  /** Clear abandoned locks */
  const abandonBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await admin
    .from('posts')
    .update({ fb_analytics_sync_status: 'stale', updated_at: new Date().toISOString() })
    .eq('fb_analytics_sync_status', 'syncing')
    .lt('updated_at', abandonBefore);

  let selector = admin
    .from('posts')
    .select('id, organization_id, external_post_id, social_account_id, fb_analytics_last_synced_at')
    .not('external_post_id', 'is', null)
    .not('social_account_id', 'is', null)
    .neq('social_account_id', '')
    .order('fb_analytics_last_synced_at', { ascending: true, nullsFirst: true })
    .limit(maxPosts);

  if (orgFilter) {
    selector = selector.eq('organization_id', orgFilter);
  }

  const { data: backlog, error } = await selector;
  if (error) throw error;

  const posts = backlog ?? [];

  let attempted = 0;
  let succeeded = 0;
  let failures = 0;
  let apiCallsApprox = 0;
  const pageAccountsHandled = new Set<string>();

  const logId = await startAnalyticsSyncLog({
    organizationId: orgFilter ?? null,
    triggeredBy: orgFilter ? 'manual' : 'cron',
  });

  for (const row of posts) {
    attempted++;
    const orgId = typeof row.organization_id === 'string' ? row.organization_id : null;
    if (!orgId) {
      failures++;
      continue;
    }

    if (!allowFacebookGraphCall(orgId)) {
      failures++;
      continue;
    }

    const res = await syncPostAnalytics({
      organizationId: orgId,
      postId: row.id as string,
    });

    if (res.ok) {
      succeeded++;
      apiCallsApprox += 2; // insights endpoint + summary

      /** Page-level rollup once per cron tick */
      const sa = row.social_account_id as string;
      const pageKey = `${orgId}:${sa}`;
      if (!pageAccountsHandled.has(pageKey)) {
        pageAccountsHandled.add(pageKey);
        try {
          const { data: acc } = await admin
            .from('social_accounts')
            .select('id, organization_id, external_id')
            .eq('id', sa)
            .maybeSingle();

          if (!acc?.external_id) continue;
          apiCallsApprox += 1;

          const pageBundle = await fetchPageInsightsBundle({
            socialAccountId: acc.id as string,
            pageExternalId: acc.external_id as string,
          });
          const m = pageBundle.metrics;

          await upsertFacebookPageAnalyticsPayload({
            organizationId: orgId,
            socialAccountId: acc.id as string,
            metricDate: utcMetricDate(),
            impressions: m.impressions,
            reach: m.reach,
            engagements: m.engagements,
            clicks: m.clicks,
            linkClicks: m.link_clicks,
            videoViews: m.video_views,
            ctr: m.ctr,
            rawMetadata: { provider: 'facebook', source: 'page_insights' },
          });
        } catch {
          failures++;
          /** swallow -- page rollup is supplementary */
        }
      }
    } else failures++;
  }

  const summary =
    failures > 0
      ? `${failures}/${attempted} Facebook analytics rows encountered errors`
      : null;

  await finalizeAnalyticsSyncLog({
    id:             logId,
    status:         failures === attempted && attempted > 0 ? 'failed' : 'completed',
    attempted,
    succeeded,
    apiCallsApprox,
    errorSummary:   summary,
  });

  if (typeof orgFilter === 'string') {
    const actor = await resolveOrganizationAuditUser(orgFilter);
    if (actor) {
      await insertAnalyticsAuditLog({
        userId: actor,
        organizationId: orgFilter,
        actionType: failures > 0 && succeeded === 0 ? 'analytics_sync_failed' : 'analytics_sync_completed',
        message:
          failures > 0 && succeeded === 0
            ? `Facebook analytics sync failed for ${attempted} queued posts`
            : `Facebook analytics synced ${succeeded}/${attempted} posts`,
        metadata: {
          failures,
          api_calls_approx: apiCallsApprox,
        },
      });
    }
  }

  return { attempted, succeeded, failures, apiCallsApprox };
}

export { aggregateAnalytics } from './aggregator';

export { refreshAnalyticsCache } from '@/lib/social/facebook/insights/cache';
