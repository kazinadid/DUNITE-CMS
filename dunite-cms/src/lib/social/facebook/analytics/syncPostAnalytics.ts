import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { upsertFacebookPostAnalyticsPayload } from '@/lib/social/facebook/analyticsDb';
import { FacebookInsightsError } from '@/lib/social/facebook/insights/errors';
import type { NormalizedPostMetrics } from '@/lib/social/facebook/insights/transformer';
import type { RawInsightsBundle } from '@/lib/social/facebook/insights/transformer';
import { buildRawMetadata } from '@/lib/social/facebook/insights/transformer';
import { allowFacebookGraphCall } from '@/lib/social/shared/orgFacebookRateLimit';
import { calculateDerivedMetrics } from './derivedMetrics';
import { fetchPostInsights } from './fetchInsights';
import { analyticsStructuredLog } from './logger';
import {
  auditFacebookTokenExpiredIfNeeded,
  markPostAnalyticsState,
} from './markPostAnalyticsState';

function utcMetricDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function metricsToPersistenceMeta(m: NormalizedPostMetrics): Record<string, unknown> {
  const bundle: RawInsightsBundle = {
    insights:            m.insights,
    shares:                m.shares,
    commentsFromSummary: m.commentsFromSummary,
    reactionsTotal:      m.reactionsTotal,
    reactionsByType:     m.reactionsByType,
    rawInsights:         m.rawInsights,
    rawSummary:          m.rawSummary,
  };

  const safe = buildRawMetadata(bundle);
  return {
    ...safe,
    engagement_rate_hint: m.engagement_rate,
    ctr_hint:             m.ctr,
  };
}

function graphMeta(err: unknown): number | undefined {
  if (err instanceof FacebookInsightsError) return err.graphCode;
  return undefined;
}

/**
 * Executes the Graph round-trip + persisted snapshot. Throws after marking the post failed
 * when Graph or persistence errors occur (queue runners complete jobs externally).
 */
export async function executePostAnalyticsSync(params: {
  organizationId: string;
  postId: string;
  syncJobId?: string | null;
}): Promise<void> {
  const t0 = Date.now();
  const admin = createSupabaseAdminClient();

  const { data: post, error: pe } = await admin
    .from('posts')
    .select('id, organization_id, external_post_id, social_account_id, status')
    .eq('id', params.postId)
    .maybeSingle();

  if (pe || !post?.external_post_id || !post.social_account_id) {
    throw new Error('Post is missing outbound Facebook linkage for analytics.');
  }

  if (post.organization_id && post.organization_id !== params.organizationId) {
    throw new Error('Organization mismatch.');
  }

  if (!allowFacebookGraphCall(params.organizationId)) {
    throw new Error('Hourly Graph budget exhausted for workspace.');
  }

  const syncingStartedAt = new Date().toISOString();

  await markPostAnalyticsState({
    postId:           params.postId,
    lastSyncedAt:      null,
    syncingStartedAt,
    syncStatus:        'syncing',
  });

  try {
    const normalized = await fetchPostInsights({
      socialAccountId: post.social_account_id as string,
      externalPostId:  post.external_post_id as string,
    });

    const derived = calculateDerivedMetrics({
      engagements: normalized.engagements,
      reach:        normalized.reach,
      impressions:  normalized.impressions,
      link_clicks: normalized.link_clicks,
      clicks:      normalized.clicks,
    });

    const engagementRate =
      derived.engagement_rate ?? normalized.engagement_rate ?? null;
    const ctr = derived.ctr ?? normalized.ctr ?? null;

    const syncedAt = new Date().toISOString();

    await upsertFacebookPostAnalyticsPayload({
      organizationId: params.organizationId,
      postId:         params.postId,
      socialAccountId: post.social_account_id as string,
      externalPostId: post.external_post_id as string,
      impressions:    normalized.impressions,
      reach:          normalized.reach,
      engagements:    normalized.engagements,
      reactions:      normalized.reactions,
      reactionsByType:
        normalized.reactionsByType as Record<string, number>,
      commentsCount: normalized.comments_count,
      sharesCount:   normalized.shares_count,
      clicks:        normalized.clicks,
      linkClicks:    normalized.link_clicks,
      videoViews:    normalized.video_views,
      engagementRate,
      ctr,
      metricDate:    utcMetricDate(),
      syncedAtIso:   syncedAt,
      rawMetadata: {
        ...metricsToPersistenceMeta(normalized),
        derived_engagement_rate: derived.engagement_rate,
        derived_ctr:             derived.ctr,
      },
      syncJobId: params.syncJobId ?? null,
    });

    await markPostAnalyticsState({
      postId:           params.postId,
      lastSyncedAt:     syncedAt,
      syncingStartedAt: null,
      syncStatus:       'synced',
    });

    analyticsStructuredLog({
      phase:           'sync',
      event:           'post_sync_ok',
      organization_id: params.organizationId,
      post_id:         params.postId,
      sync_job_id:     params.syncJobId ?? undefined,
      ms:              Date.now() - t0,
    });
  } catch (e: unknown) {
    const gc = graphMeta(e);
    await auditFacebookTokenExpiredIfNeeded(params.organizationId, gc);
    await markPostAnalyticsState({
      postId:           params.postId,
      lastSyncedAt:      null,
      syncingStartedAt: null,
      syncStatus:       'failed',
    });
    analyticsStructuredLog({
      phase:           'sync',
      event:           'post_sync_fail',
      level:           'error',
      organization_id: params.organizationId,
      post_id:         params.postId,
      sync_job_id:     params.syncJobId ?? undefined,
      ms:              Date.now() - t0,
      extra:           { message: e instanceof Error ? e.message : 'unknown' },
    });
    throw e;
  }
}

export async function syncPostAnalytics(params: {
  organizationId: string;
  postId: string;
  syncJobId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await executePostAnalyticsSync(params);
    return { ok: true };
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : 'Facebook post analytics sync failed.';
    return { ok: false, error: msg };
  }
}
