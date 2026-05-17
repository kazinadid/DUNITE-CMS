import { NextResponse } from 'next/server';

import { requireCronBearer } from '@/lib/social/facebook/analytics/cronHelpers';
import { runFacebookAnalyticsStaleRecoveryCron } from '@/lib/social/facebook/analytics/cronRunners';
import { analyticsStructuredLog } from '@/lib/social/facebook/analytics/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireCronBearer(request);
  if (!auth.ok) return auth.response;

  analyticsStructuredLog({
    phase: 'cron',
    event: 'facebook_analytics_stale_recovery_start',
    level: 'info',
    extra: {},
  });

  try {
    const stats = await runFacebookAnalyticsStaleRecoveryCron();

    analyticsStructuredLog({
      phase: 'cron',
      event: 'facebook_analytics_stale_recovery_done',
      level: 'info',
      extra: {
        enqueue_posts: stats.enqueuedPosts,
        enqueue_pages: stats.enqueuedPages,
        drained:      stats.drain,
      },
    });

    return NextResponse.json({
      ok:               true as const,
      enqueued_posts:   stats.enqueuedPosts,
      enqueued_pages:   stats.enqueuedPages,
      drain_attempted:  stats.drain.attempted,
      drain_succeeded:  stats.drain.succeeded,
      drain_failures:   stats.drain.failures,
      api_calls_approx: stats.drain.apiCallsApprox,
      passes:           stats.drain.passes,
    });
  } catch (e: unknown) {
    analyticsStructuredLog({
      phase: 'cron',
      event: 'facebook_analytics_stale_recovery_error',
      level: 'error',
      extra: { message: e instanceof Error ? e.message : 'cron_failed' },
    });
    return NextResponse.json(
      { ok: false as const, error: e instanceof Error ? e.message : 'cron_failed' },
      { status: 500 },
    );
  }
}
