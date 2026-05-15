import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ImportExecutionStats } from '../../types';
import { deriveTerminalStatus } from './lifecycle';
import { logWorkerInfo } from './logger';

interface RemainingCounts {
  pending: number;
  importing: number;
}

async function remainingCounts(supabase: SupabaseClient, jobId: string): Promise<RemainingCounts> {
  const { count: pending } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .in('processing_state', ['valid', 'warning'])
    .is('post_id', null);

  const { count: importing } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .eq('processing_state', 'importing');

  return {
    pending: pending ?? 0,
    importing: importing ?? 0,
  };
}

async function terminalizeJobIfDone(supabase: SupabaseClient, jobId: string): Promise<'completed' | 'partial_success' | 'failed' | null> {
  const { data: rows } = await supabase.from('import_rows').select('processing_state').eq('import_job_id', jobId);
  const list = rows ?? [];
  const failed = list.filter((r) => r.processing_state === 'failed').length;
  const imported = list.filter((r) => r.processing_state === 'imported').length;

  const terminal = deriveTerminalStatus({
    importedCount: imported,
    failedCount: failed,
  });

  await supabase
    .from('import_jobs')
    .update({
      status: terminal,
      worker_claim_id: null,
      processing_heartbeat_at: new Date().toISOString(),
      error_summary:
        terminal === 'failed'
          ? 'No rows could be imported. See chunk/attempt diagnostics.'
          : terminal === 'partial_success'
            ? 'Some rows failed during execution. See chunk/attempt diagnostics.'
            : null,
    })
    .eq('id', jobId);

  return terminal;
}

export async function updateExecutionProgress(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    workerId: string;
    processedThisChunk: number;
    importedThisChunk: number;
    failedThisChunk: number;
    skippedThisChunk: number;
    postsCreatedThisChunk: number;
    scheduledPostsThisChunk: number;
    publishingReadyThisChunk: number;
    mediaAttachedThisChunk: number;
    platformLinksThisChunk: number;
    chunkDurationMs: number;
  },
): Promise<{ finished: boolean; terminalStatus?: 'completed' | 'partial_success' | 'failed' }> {
  const {
    jobId,
    workerId,
    processedThisChunk,
    importedThisChunk,
    failedThisChunk,
    skippedThisChunk,
    postsCreatedThisChunk,
    scheduledPostsThisChunk,
    publishingReadyThisChunk,
    mediaAttachedThisChunk,
    platformLinksThisChunk,
    chunkDurationMs,
  } = params;
  await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

  const { data: job } = await supabase
    .from('import_jobs')
    .select('execution_stats,total_rows,imported_rows,created_at,started_at')
    .eq('id', jobId)
    .maybeSingle();
  const nowIso = new Date().toISOString();
  const stats = ((job?.execution_stats ?? {}) as ImportExecutionStats) ?? {};
  const chunksCompleted = (stats.chunks_completed ?? 0) + 1;
  const totalProcessed = (stats.processed ?? 0) + processedThisChunk;
  const totalSucceeded = (stats.succeeded ?? 0) + importedThisChunk;
  const totalFailed = (stats.failed ?? 0) + failedThisChunk;
  const totalSkipped = (stats.skipped_rows ?? 0) + skippedThisChunk;
  const totalPostsCreated = (stats.posts_created ?? 0) + postsCreatedThisChunk;
  const totalScheduledPosts = (stats.scheduled_posts ?? 0) + scheduledPostsThisChunk;
  const totalPublishingReady = (stats.publishing_ready_posts ?? 0) + publishingReadyThisChunk;
  const totalMediaAttached = (stats.media_assets_attached ?? 0) + mediaAttachedThisChunk;
  const totalPlatformLinks = (stats.platform_links_created ?? 0) + platformLinksThisChunk;
  const durationMs = (() => {
    const start = job?.started_at ?? job?.created_at;
    if (!start) return undefined;
    const t0 = new Date(start as string).getTime();
    if (Number.isNaN(t0)) return undefined;
    return Math.max(0, Date.now() - t0);
  })();
  const rowsPerSecond =
    chunkDurationMs > 0 ? Number(((processedThisChunk * 1000) / chunkDurationMs).toFixed(2)) : stats.rows_per_second;

  const merged: ImportExecutionStats = {
    ...stats,
    worker_id: workerId,
    chunks_completed: chunksCompleted,
    processed: totalProcessed,
    succeeded: totalSucceeded,
    failed: totalFailed,
    skipped_rows: totalSkipped,
    posts_created: totalPostsCreated,
    scheduled_posts: totalScheduledPosts,
    publishing_ready_posts: totalPublishingReady,
    media_assets_attached: totalMediaAttached,
    platform_links_created: totalPlatformLinks,
    last_chunk_at: nowIso,
    last_chunk_rows: processedThisChunk,
    last_chunk_duration_ms: chunkDurationMs,
    rows_per_second: rowsPerSecond,
    last_heartbeat_at: nowIso,
    processing_duration_ms: durationMs,
  };

  await supabase
    .from('import_jobs')
    .update({
      processing_heartbeat_at: nowIso,
      execution_stats: merged as unknown as Record<string, unknown>,
    })
    .eq('id', jobId);

  const remaining = await remainingCounts(supabase, jobId);
  if (remaining.pending === 0 && remaining.importing === 0) {
    const terminal = await terminalizeJobIfDone(supabase, jobId);
    if (terminal) {
      await supabase
        .from('import_jobs')
        .update({
          execution_stats: {
            ...merged,
            terminal_at: nowIso,
          } as unknown as Record<string, unknown>,
        })
        .eq('id', jobId);
      logWorkerInfo('progress.terminalized', {
        job_id: jobId,
        terminal_status: terminal,
      });
      return { finished: true, terminalStatus: terminal };
    }
  }

  return { finished: false };
}
