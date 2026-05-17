import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  resolveOrgPublishGate,
  canViewFacebookAnalytics,
} from '@/lib/org/publishGate';
import { failJson, okJson } from '@/lib/social/http/apiResponse';
import {
  listPostAnalyticsDescending,
  mapRowToStored,
} from '@/lib/social/facebook/analyticsDb';
import type { PostInsights, ReactionBreakdown } from '@/lib/social/facebook/insights/types';
import { consolidateSeriesByMetricDate } from '@/lib/social/facebook/insights/aggregator';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let gate;
  try {
    const auth = await createAuthenticatedSupabaseServerClient();
    gate = await resolveOrgPublishGate(auth.user.id);
    if (!gate || !canViewFacebookAnalytics(gate)) {
      return failJson('Insufficient permissions.', 403);
    }
  } catch {
    return failJson('Not authenticated.', 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: post } = await admin
    .from('posts')
    .select(
      'id, organization_id, external_post_id, social_account_id, fb_analytics_last_synced_at, fb_analytics_sync_status, content, published_at, status',
    )
    .eq('id', id)
    .maybeSingle();

  const p = post as
    | ({
        id?: string;
        organization_id?: string | null;
        external_post_id?: string | null;
        social_account_id?: string | null;
        fb_analytics_last_synced_at?: string | null;
        fb_analytics_sync_status?: string | null;
        content?: string;
        published_at?: string | null;
        status?: string;
      })
    | null;

  if (!p?.id || p.organization_id !== gate.organizationId) {
    return failJson('Post not found.', 404);
  }

  if (!p.external_post_id) {
    return okJson({
      hasFacebookPost: false as const,
      post: {
        status: p.fb_analytics_sync_status,
        lastSyncedAt: p.fb_analytics_last_synced_at,
      },
    });
  }

  const rows = await listPostAnalyticsDescending({
    organizationId: gate.organizationId,
    postId: p.id,
  });

  const consolidated = consolidateSeriesByMetricDate(
    rows.map((r) => mapRowToStored(r as unknown as Record<string, unknown>)),
  );

  const latest = rows[0];

  const reactionsByType =
    (latest?.reactions_by_type as ReactionBreakdown | null | undefined) ?? {};

  const insights: PostInsights = {
    postId: p.id,
    externalPostId: p.external_post_id,
    socialAccountId: p.social_account_id ?? null,
    syncedAtIso:
      latest?.synced_at ??
      p.fb_analytics_last_synced_at ??
      new Date().toISOString(),
    metricDate: latest?.metric_date ?? new Date().toISOString().slice(0, 10),
    impressions: latest?.impressions ?? 0,
    reach: latest?.reach ?? 0,
    engagements: latest?.engagements ?? 0,
    reactionsTotal: latest?.reactions ?? 0,
    reactionsByType,
    commentsCount: latest?.comments_count ?? 0,
    sharesCount: latest?.shares_count ?? 0,
    clicks: latest?.clicks ?? 0,
    linkClicks: latest?.link_clicks ?? 0,
    videoViews: latest?.video_views ?? 0,
    engagementRate: latest?.engagement_rate ?? null,
    ctr: latest?.ctr ?? null,
    series: consolidated.map((row) => ({
      metricDate: row.metric_date,
      impressions: row.impressions,
      reach: row.reach,
      engagements: row.engagements,
    })),
  };

  return okJson({
    hasFacebookPost: true as const,
    post: {
      id: p.id,
      contentPreview: (p.content ?? '').slice(0, 200),
      publishedAtIso: p.published_at ?? null,
      status: p.status,
      fbSyncStatus: p.fb_analytics_sync_status,
      fbLastSyncedAt: p.fb_analytics_last_synced_at,
    },
    insights,
  });
}
