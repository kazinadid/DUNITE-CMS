import { NextResponse } from 'next/server';

import { requireCronBearer } from '@/lib/social/facebook/analytics/cronHelpers';
import { runFacebookAnalyticsDailyCron } from '@/lib/social/facebook/analytics/cronRunners';
import { analyticsStructuredLog } from '@/lib/social/facebook/analytics/logger';

/** Shared HTTP handler for daily Facebook analytics cron routes. */
export async function handleFacebookAnalyticsDailyHttp(
  request: Request,
): Promise<NextResponse> {
  const auth = requireCronBearer(request);
  if (!auth.ok) return auth.response;

  analyticsStructuredLog({
    phase: 'cron',
    event: 'facebook_analytics_daily_start',
    level: 'info',
    extra: {},
  });

  try {
    const stats = await runFacebookAnalyticsDailyCron();

    analyticsStructuredLog({
      phase: 'cron',
      event: 'facebook_analytics_daily_done',
      level: 'info',
      extra: {
        enqueue_posts:  stats.enqueuedPosts,
        enqueue_pages: stats.enqueuedPages,
        drained:       stats.drain,
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
      event: 'facebook_analytics_daily_error',
      level: 'error',
      extra: { message: e instanceof Error ? e.message : 'cron_failed' },
    });
    return NextResponse.json(
      { ok: false as const, error: e instanceof Error ? e.message : 'cron_failed' },
      { status: 500 },
    );
  }
}
