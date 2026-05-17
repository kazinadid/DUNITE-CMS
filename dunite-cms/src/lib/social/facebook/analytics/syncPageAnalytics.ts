import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { upsertFacebookPageAnalyticsPayload } from '@/lib/social/facebook/analyticsDb';
import { allowFacebookGraphCall } from '@/lib/social/shared/orgFacebookRateLimit';
import type { NormalizedPostMetrics } from '@/lib/social/facebook/insights/transformer';
import { calculateDerivedMetrics } from './derivedMetrics';
import { fetchPageInsights } from './fetchInsights';
import { analyticsStructuredLog } from './logger';

function utcMetricDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function executePageAnalyticsSync(params: {
  organizationId: string;
  socialAccountId: string;
  syncJobId?: string | null;
}): Promise<void> {
  const t0 = Date.now();
  const admin = createSupabaseAdminClient();

  const { data: acc, error } = await admin
    .from('social_accounts')
    .select('id, organization_id, external_id, provider')
    .eq('id', params.socialAccountId)
    .maybeSingle();

  if (error || !acc?.external_id) {
    throw new Error('Facebook Page account is missing an external Page id.');
  }

  if (acc.organization_id !== params.organizationId) {
    throw new Error('Organization mismatch for linked Page.');
  }

  if (!allowFacebookGraphCall(params.organizationId)) {
    throw new Error('Hourly Graph budget exhausted for workspace.');
  }

  const bundle = await fetchPageInsights({
    socialAccountId: params.socialAccountId,
    pageExternalId: acc.external_id as string,
  });

  const m: NormalizedPostMetrics = bundle.metrics;
  const derived = calculateDerivedMetrics({
    engagements: m.engagements,
    reach:        m.reach,
    impressions:  m.impressions,
    link_clicks: m.link_clicks,
    clicks:      m.clicks,
  });

  const ctr = derived.ctr ?? m.ctr ?? null;

  analyticsStructuredLog({
    phase:           'sync',
    event:           'page_sync_ok',
    organization_id: params.organizationId,
    sync_job_id:     params.syncJobId ?? undefined,
    ms:              Date.now() - t0,
  });

  await upsertFacebookPageAnalyticsPayload({
    organizationId: params.organizationId,
    socialAccountId: params.socialAccountId,
    metricDate:     utcMetricDate(),
    impressions:    m.impressions,
    reach:          m.reach,
    engagements:    m.engagements,
    clicks:         m.clicks,
    linkClicks:    m.link_clicks,
    videoViews:    m.video_views,
    ctr,
    rawMetadata: {
      provider:         'facebook',
      source:          'page_insights',
      graph_period:    'day',
      engagement_rate: derived.engagement_rate,
      derived_ctr:     derived.ctr,
      raw_truncated:
        bundle.raw && Object.keys(bundle.raw).length > 0
          ? '[omitted]'
          : null,
    },
    syncJobId: params.syncJobId ?? null,
  });
}

export async function syncPageAnalytics(params: {
  organizationId: string;
  socialAccountId: string;
  syncJobId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await executePageAnalyticsSync(params);
    return { ok: true };
  } catch (e: unknown) {
    return {
      ok:    false,
      error: e instanceof Error ? e.message : 'Facebook page analytics sync failed.',
    };
  }
}
