import { NextResponse } from 'next/server';

import { runScheduledFacebookPublishingTick } from '@/lib/social/facebook/scheduler';
import { runScheduledLinkedInPublishingTick } from '@/lib/social/linkedin/scheduler';

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
    const [fbResult, liResult] = await Promise.all([
      runScheduledFacebookPublishingTick(),
      runScheduledLinkedInPublishingTick(),
    ]);
    
    return NextResponse.json({
      ok:        true as const,
      facebook:  fbResult,
      linkedin:  liResult,
    });
  } catch (e: unknown) {
    console.error('[cron/publish-scheduled]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'worker_failed' },
      { status: 500 },
    );
  }
}
