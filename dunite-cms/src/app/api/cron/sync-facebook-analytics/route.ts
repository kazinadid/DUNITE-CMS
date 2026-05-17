import { NextResponse } from 'next/server';

import { syncOrganizationAnalytics } from '@/lib/social/facebook/insights/syncWorker';

export const dynamic = 'force-dynamic';

/** Hourly-ish Facebook Insights sync — secure with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false as const, error: 'CRON_SECRET is not configured' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false as const, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await syncOrganizationAnalytics({ maxPosts: 30 });
    console.info('[cron/sync-facebook-analytics]', stats);

    return NextResponse.json({
      ok:           true as const,
      attempted:    stats.attempted,
      succeeded:    stats.succeeded,
      failures:     stats.failures,
      api_calls:    stats.apiCallsApprox,
    });
  } catch (e: unknown) {
    console.error('[cron/sync-facebook-analytics]', e);
    return NextResponse.json(
      {
        ok: false as const,
        error: e instanceof Error ? e.message : 'worker_failed',
      },
      { status: 500 },
    );
  }
}
