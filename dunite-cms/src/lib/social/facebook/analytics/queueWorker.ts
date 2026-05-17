import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  claimFacebookAnalyticsSyncJobs,
  completeFacebookAnalyticsJob,
  enqueueFacebookAnalyticsJob,
  finalizeAnalyticsSyncLog,
  startAnalyticsSyncLog,
} from '@/lib/social/facebook/analyticsDb';
import type { FacebookAnalyticsQueueRow } from '@/lib/social/facebook/analyticsDb';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { executePostAnalyticsSync } from '@/lib/social/facebook/analytics/syncPostAnalytics';
import { executePageAnalyticsSync } from '@/lib/social/facebook/analytics/syncPageAnalytics';
import { analyticsStructuredLog } from '@/lib/social/facebook/analytics/logger';
import { errorSummaryFromUnknown, normalizeThrownError } from '@/lib/social/facebook/analytics/normalizeThrownError';

/**
 * Executes claimed queue rows synchronously inside the current Lambda / Node process.
 * Safe for horizontally scaled workers thanks to SKIP LOCKED claim semantics.
 */
export async function processFacebookAnalyticsQueueDrain(opts: {
  runnerId?: string;
  batchSize: number;
  maxPasses: number;
  deadlineMs: number;
  lockSeconds?: number;
  startedAtMono?: number;
}): Promise<{
  attempted: number;
  succeeded: number;
  failures: number;
  apiCallsApprox: number;
  passes: number;
}> {
  const mono0 = opts.startedAtMono ?? Date.now();
  const deadline = mono0 + Math.max(1_000, opts.deadlineMs);
  const runner = opts.runnerId ?? `analytics-${randomUUID().slice(0, 8)}`;

  let attempted = 0;
  let succeeded = 0;
  let failures = 0;
  let apiCallsApprox = 0;
  let passes = 0;

  while (
    passes < opts.maxPasses &&
    Date.now() < deadline - 750
  ) {
    passes++;
    const rows = await claimFacebookAnalyticsSyncJobs(
      opts.batchSize,
      runner,
      opts.lockSeconds ?? 120,
    );
    const jobs = rows as unknown as FacebookAnalyticsQueueRow[];

    if (!jobs.length) break;

    analyticsStructuredLog({
      phase: 'queue',
      event: 'queue_claim',
      ms:    undefined,
      extra: { runner, claimed: jobs.length, pass: passes },
    });

    for (const job of jobs) {
      if (Date.now() >= deadline) break;
      attempted++;
      try {
        if (job.job_kind === 'facebook_post_refresh') {
          const postId = job.post_id ?? undefined;
          if (!postId) throw new Error('Post job missing post_id.');
          await executePostAnalyticsSync({
            organizationId: job.organization_id,
            postId,
            syncJobId:      job.id,
          });
          apiCallsApprox += 2;
        } else {
          const saId = job.social_account_id ?? undefined;
          if (!saId) throw new Error('Page job missing social_account_id.');
          await executePageAnalyticsSync({
            organizationId: job.organization_id,
            socialAccountId: saId,
            syncJobId:      job.id,
          });
          apiCallsApprox += 1;
        }

        await completeFacebookAnalyticsJob({
          jobId:     job.id,
          outcome:   'completed',
          lastError: null,
        });
        succeeded++;
      } catch (e: unknown) {
        failures++;
        await completeFacebookAnalyticsJob({
          jobId:     job.id,
          outcome:   'failed',
          lastError: errorSummaryFromUnknown(e, 1200),
        });
      }
    }
  }

  return { attempted, succeeded, failures, apiCallsApprox, passes };
}

function utcDayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROW_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRowUuid(value: unknown): value is string {
  return typeof value === 'string' && ROW_UUID.test(value.trim());
}

function cutoffIsoHours(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function postEligibleForEnqueue(opts: {
  lastSyncedIso: string | null;
  syncStatus: string | null | undefined;
  cutoffIso: string;
  focusStaleOnly: boolean;
}): boolean {
  const { lastSyncedIso, syncStatus: rawStatus, cutoffIso, focusStaleOnly } =
    opts;
  const st = rawStatus ?? null;

  if (st === 'syncing') return false;

  if (focusStaleOnly) {
    return st === 'stale' || st === 'failed';
  }

  const recentlySynced =
    typeof lastSyncedIso === 'string' &&
    Number.isFinite(Date.parse(lastSyncedIso)) &&
    Date.parse(lastSyncedIso) > Date.parse(cutoffIso);

  if (st === 'synced' && recentlySynced) return false;

  const timeNeeds =
    !lastSyncedIso ||
    !Number.isFinite(Date.parse(lastSyncedIso)) ||
    Date.parse(lastSyncedIso) <= Date.parse(cutoffIso);

  const lifecycleNeeds =
    st === null ||
    st === 'pending' ||
    st === 'failed' ||
    st === 'stale';

  return timeNeeds || lifecycleNeeds;
}

/**
 * Preferred enterprise entrypoint — enqueues deterministic jobs then drains bounded queue passes.
 */
export async function batchSyncOrganizationAnalytics(opts?: {
  organizationId?: string | null;
  stalenessHours?: number;
  maxEnqueuePosts?: number;
  maxEnqueuePagesPerOrg?: number;
  drainBatchSize?: number;
  drainMaxPasses?: number;
  drainDeadlineMs?: number;
  triggeredBy?: 'cron' | 'manual' | 'worker';
  idempotencyNamespace?: string;
  focusStaleOnly?: boolean;
}): Promise<{
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
  const admin = createSupabaseAdminClient();
  const stalenessHours = opts?.stalenessHours ?? 24;
  const maxEnqueuePosts = Math.min(2_000, Math.max(1, opts?.maxEnqueuePosts ?? 400));
  const maxEnqueuePagesPerOrg = Math.min(120, Math.max(1, opts?.maxEnqueuePagesPerOrg ?? 24));
  const drainBatchSize = Math.min(120, Math.max(1, opts?.drainBatchSize ?? 25));
  const drainMaxPasses = Math.min(200, Math.max(1, opts?.drainMaxPasses ?? 60));
  const drainDeadlineMs = Math.min(
    780_000,
    Math.max(5_000, opts?.drainDeadlineMs ?? 55_000),
  );
  const rawOrg = opts?.organizationId;
  const orgFilter =
    rawOrg === undefined || rawOrg === null || `${rawOrg}`.trim() === ''
      ? null
      : `${rawOrg}`.trim();
  const idemPrefix =
    opts?.idempotencyNamespace ?? `batch:${utcDayStamp()}`;
  const focusStaleOnly = opts?.focusStaleOnly === true;

  const cutoffIso = cutoffIsoHours(stalenessHours);
  let enqueuedPosts = 0;
  let enqueuedPages = 0;
  const scopedKeys = new Set<string>();

  const logId = await startAnalyticsSyncLog({
    organizationId: orgFilter,
    triggeredBy:    opts?.triggeredBy ?? 'cron',
  });

  try {
    let query = admin
      .from('posts')
      .select(
        'id, organization_id, social_account_id, external_post_id, fb_analytics_last_synced_at, fb_analytics_sync_status',
      )
      .not('external_post_id', 'is', null)
      .not('organization_id', 'is', null)
      /** UUID column — never compare to `''` (PostgreSQL raises 22P02). Non-null suffices. */
      .not('social_account_id', 'is', null)
      .order('fb_analytics_last_synced_at', {
        ascending:    true,
        nullsFirst:   true,
      })
      .limit(maxEnqueuePosts * 4);

    if (orgFilter) {
      query = query.eq('organization_id', orgFilter);
    }

    if (focusStaleOnly) {
      query = query.or(
        'fb_analytics_sync_status.eq.stale,fb_analytics_sync_status.eq.failed',
      );
    }

    const { data: rows, error } = await query;
    if (error) throw normalizeThrownError(error);

    const orgPageDedupeMap = new Map<string, Set<string>>();

    for (const raw of rows ?? []) {
      if (enqueuedPosts >= maxEnqueuePosts) break;
      const obj = raw as Record<string, unknown>;

      const orgId =
        typeof obj.organization_id === 'string' ? obj.organization_id.trim() : null;
      const pid = typeof obj.id === 'string' ? obj.id.trim() : null;
      const saId =
        typeof obj.social_account_id === 'string' ? obj.social_account_id.trim() : '';

      if (!isRowUuid(orgId) || !isRowUuid(pid) || !isRowUuid(saId)) {
        continue;
      }

      const lastSynced =
        typeof obj.fb_analytics_last_synced_at === 'string'
          ? obj.fb_analytics_last_synced_at
          : null;

      const st =
        typeof obj.fb_analytics_sync_status === 'string'
          ? obj.fb_analytics_sync_status
          : null;

      if (
        !orgId ||
        !pid ||
        !saId ||
        !postEligibleForEnqueue({
          lastSyncedIso: lastSynced,
          syncStatus:   st,
          cutoffIso,
          focusStaleOnly,
        })
      ) {
        continue;
      }

      const ikPost = `${idemPrefix}:post:${orgId}:${pid}`;
      const r = await enqueueFacebookAnalyticsJob({
        organizationId: orgId,
        jobKind:         'facebook_post_refresh',
        postId:           pid,
        idempotencyKey:   ikPost,
        metadata:         { staleness_hours: stalenessHours, focusStaleOnly },
      });

      if (!r.duplicate) enqueuedPosts++;

      if (!orgPageDedupeMap.has(orgId)) {
        orgPageDedupeMap.set(orgId, new Set<string>());
      }
      const setSa = orgPageDedupeMap.get(orgId)!;
      if (
        maxEnqueuePagesPerOrg > 0 &&
        !setSa.has(saId) &&
        setSa.size < maxEnqueuePagesPerOrg
      ) {
        setSa.add(saId);
        scopedKeys.add(`${orgId}:${saId}`);
      }
    }

    for (const scoped of scopedKeys) {
      const sep = scoped.indexOf(':');
      const orgId = sep === -1 ? '' : scoped.slice(0, sep);
      const saId = sep === -1 ? '' : scoped.slice(sep + 1);
      if (!isRowUuid(orgId) || !isRowUuid(saId)) continue;
      const ik = `${idemPrefix}:page:${orgId}:${saId}`;
      const r = await enqueueFacebookAnalyticsJob({
        organizationId: orgId,
        jobKind:           'facebook_page_refresh',
        socialAccountId:  saId,
        idempotencyKey:    ik,
        metadata:          { staleness_hours: stalenessHours },
      });
      if (!r.duplicate) enqueuedPages++;
    }

    const drainStarted = Date.now();

    analyticsStructuredLog({
      phase: 'queue',
      event: 'queue_batch_start',
      extra: {
        enqueued_posts: enqueuedPosts,
        enqueued_pages: enqueuedPages,
        org_scoped:     Boolean(orgFilter),
      },
    });

    const drain = await processFacebookAnalyticsQueueDrain({
      runnerId:     `${idemPrefix}:${randomUUID().slice(0, 8)}`,
      batchSize:    drainBatchSize,
      maxPasses:    drainMaxPasses,
      deadlineMs:   drainDeadlineMs,
      startedAtMono: drainStarted,
    });

    const summaryPieces = [
      enqueuedPosts > 0 || enqueuedPages > 0
        ? `Enqueue posts=${enqueuedPosts} pages=${enqueuedPages}`
        : null,
      `Drain ${drain.succeeded}/${drain.attempted}`,
    ].filter(Boolean);

    await finalizeAnalyticsSyncLog({
      id:               logId,
      status:
        drain.attempted > 0 && drain.failures >= drain.attempted
          ? 'failed'
          : 'completed',
      attempted:       drain.attempted,
      succeeded:       drain.succeeded,
      apiCallsApprox:  drain.apiCallsApprox,
      errorSummary:
        drain.failures && drain.failures > 0
          ? `${summaryPieces.join('; ')} (${drain.failures} failures)`
          : summaryPieces.length
            ? summaryPieces.join('; ')
            : null,
    });

    return { enqueuedPosts, enqueuedPages, drain };
  } catch (e: unknown) {
    await finalizeAnalyticsSyncLog({
      id:               logId,
      status:           'failed',
      attempted:        0,
      succeeded:        0,
      apiCallsApprox:   0,
      errorSummary:     errorSummaryFromUnknown(e, 2048),
    });
    throw normalizeThrownError(e);
  }
}

export async function recoverFacebookAnalyticsStalePostsDb(): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc('recover_stale_syncing_posts');
  if (error) {
    throw new Error(`recover_stale_syncing_posts failed: ${normalizeThrownError(error).message}`);
  }
}
