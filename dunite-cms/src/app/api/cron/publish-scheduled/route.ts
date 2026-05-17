import { NextResponse } from 'next/server';

import { runScheduledFacebookPublishingTick } from '@/lib/social/facebook/scheduler';

export const dynamic = 'force-dynamic';

/**
 * Processes up to 10 due Facebook publishing_jobs rows secured with CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScheduledFacebookPublishingTick();
    return NextResponse.json({
      ok:        true as const,
      processed: result.processed,
      errors:    result.errors,
    });
  } catch (e: unknown) {
    console.error('[cron/publish-scheduled]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'worker_failed' },
      { status: 500 },
    );
  }
}
