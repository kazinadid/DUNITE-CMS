import { NextResponse } from 'next/server';

import { fetchDuePublishingJobsForWorker } from '@/lib/publishing/dueJobs';
import { runScheduledFacebookPublishingTick } from '@/lib/social/facebook/scheduler';

/**
 * Scheduled worker entrypoint.
 *
 * Historically this endpoint only listed due jobs, which meant a cron wired to
 * `/api/cron/publish-scan` never actually published scheduled posts. Keep a
 * dry-run mode for diagnostics, but execute due jobs by default so scheduled
 * posts transition scheduled → publishing → published on time.
 *
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
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === '1'
      || url.searchParams.get('mode') === 'scan';
    if (!dryRun) {
      const result = await runScheduledFacebookPublishingTick();
      return NextResponse.json({
        ok:        true,
        mode:      'execute',
        processed: result.processed,
        errors:    result.errors,
      });
    }

    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(200, Math.max(1, Number(limitParam) || 50));

    const jobs = await fetchDuePublishingJobsForWorker(limit);

    return NextResponse.json({
      ok:    true,
      mode:  'scan',
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
