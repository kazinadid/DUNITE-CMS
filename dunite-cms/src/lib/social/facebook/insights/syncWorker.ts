import 'server-only';

import {
  insertAnalyticsAuditLog,
  resolveOrganizationAuditUser,
} from '@/lib/activity/analyticsAudit';
import { syncPostAnalytics as syncPostAnalyticsFromEngine } from '@/lib/social/facebook/analytics/syncPostAnalytics';
import { batchSyncOrganizationAnalytics } from '@/lib/social/facebook/analytics/queueWorker';

/** @deprecated Prefer `analytics/syncPostAnalytics.syncPostAnalytics` — kept for existing imports */
export async function syncPostAnalytics(params: {
  organizationId: string;
  postId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return syncPostAnalyticsFromEngine(params);
}

/**
 * Processes a bounded backlog via the durable Postgres queue pattern.
 */
export async function syncOrganizationAnalytics(options?: {
  organizationId?: string | null | undefined;
  maxPosts?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  failures: number;
  apiCallsApprox: number;
}> {
  const orgFilterRaw = options?.organizationId;
  const orgFilter =
    orgFilterRaw === undefined || orgFilterRaw === ''
      ? null
      : (orgFilterRaw as string);

  const maxPosts = Math.min(320, Math.max(1, options?.maxPosts ?? 40));

  const batch = await batchSyncOrganizationAnalytics({
    organizationId:        orgFilter,
    triggeredBy:         orgFilter ? 'manual' : 'cron',
    maxEnqueuePosts:       maxPosts,
    maxEnqueuePagesPerOrg: 40,
    idempotencyNamespace:  orgFilter
      ? `manual-org:${orgFilter}:${new Date().toISOString().slice(0, 16)}`
      : undefined,
    drainDeadlineMs:       orgFilter ? 52000 : 55000,
  });

  const { drain } = batch;

  if (typeof orgFilter === 'string') {
    const actor = await resolveOrganizationAuditUser(orgFilter);
    if (actor) {
      await insertAnalyticsAuditLog({
        userId:         actor,
        organizationId: orgFilter,
        actionType:
          drain.failures > 0 && drain.succeeded === 0
            ? 'analytics_sync_failed'
            : 'analytics_sync_completed',
        message:
          drain.failures > 0 && drain.succeeded === 0
            ? `Facebook analytics queue drained with ${drain.failures} failures (${drain.attempted} attempts)`
            : `Facebook analytics queue flushed ${drain.succeeded}/${drain.attempted} (${batch.enqueuedPosts} posts queued)`,
        metadata: {
          enqueue_posts:  batch.enqueuedPosts,
          enqueue_pages: batch.enqueuedPages,
          failures:       drain.failures,
          passes:        drain.passes,
          api_calls_approx: drain.apiCallsApprox,
        },
      });
    }
  }

  return {
    attempted:     drain.attempted,
    succeeded:     drain.succeeded,
    failures:      drain.failures,
    apiCallsApprox: drain.apiCallsApprox,
  };
}

export { aggregateAnalytics } from './aggregator';

export { refreshAnalyticsCache } from '@/lib/social/facebook/insights/cache';
