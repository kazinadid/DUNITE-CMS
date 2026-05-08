import { NextResponse } from 'next/server';

import { fetchDuePublishingJobsForWorker } from '@/lib/publishing/dueJobs';

/**
 * Scheduled worker / platform probe: lists due jobs without executing network calls.
 * Protect with `Authorization: Bearer <CRON_SECRET>` (or equivalent in production).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const limitParam = new URL(request.url).searchParams.get('limit');
    const limit = Math.min(200, Math.max(1, Number(limitParam) || 50));

    const jobs = await fetchDuePublishingJobsForWorker(limit);

    return NextResponse.json({
      ok:    true,
      count: jobs.length,
      jobs,
    });
  } catch (e: unknown) {
    console.error('[cron/publish-scan]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'scan failed' },
      { status: 500 },
    );
  }
}
