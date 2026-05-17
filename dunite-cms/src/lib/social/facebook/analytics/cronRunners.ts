import 'server-only';

import {
  batchSyncOrganizationAnalytics,
  recoverFacebookAnalyticsStalePostsDb,
} from '@/lib/social/facebook/analytics/queueWorker';

/** Daily rollup + recovery path for platform cron callers. */
export async function runFacebookAnalyticsDailyCron(): Promise<{
  enqueuedPosts: number;
  enqueuedPages: number;
  drain: {
    attempted: number;
    succeeded: number;
    failures: number;
    apiCallsApprox: number;
    passes: number;
  };
}> {
  await recoverFacebookAnalyticsStalePostsDb();

  return batchSyncOrganizationAnalytics({
    triggeredBy:     'cron',
    stalenessHours: 24,
    idempotencyNamespace: `daily:${new Date().toISOString().slice(0, 10)}`,
    focusStaleOnly:     false,
  });
}

export async function runFacebookAnalyticsStaleRecoveryCron(): Promise<{
  enqueuedPosts: number;
  enqueuedPages: number;
  drain: {
    attempted: number;
    succeeded: number;
    failures: number;
    apiCallsApprox: number;
    passes: number;
  };
}> {
  await recoverFacebookAnalyticsStalePostsDb();

  return batchSyncOrganizationAnalytics({
    triggeredBy:         'cron',
    stalenessHours:      6,
    idempotencyNamespace: `stale:${new Date().toISOString().slice(0, 13)}`,
    focusStaleOnly:      true,
    maxEnqueuePosts:     600,
    drainDeadlineMs:     56000,
  });
}
