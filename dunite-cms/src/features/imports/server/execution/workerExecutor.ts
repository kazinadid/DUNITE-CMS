import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveImportChunkSize } from '../importQueueConstants';
import { fetchClaimedRows, finishChunk, claimChunk } from './chunkProcessor';
import { logWorkerError, logWorkerInfo, logWorkerWarn } from './logger';
import { updateExecutionProgress } from './progressTracker';
import { claimNextQueuedJob, ensureJobProcessingLease, heartbeatJob, loadLeaseJob, releaseJobLease } from './queueManager';
import { recoverStaleRowClaims } from './retryManager';
import { processClaimedRow } from './rowProcessor';
import type { ExecuteEngineResult, LeaseJob } from './types';

function nowMs() {
  return Date.now();
}

export interface ExecuteOneChunkParams {
  supabase: SupabaseClient;
  workerId: string;
  trigger: 'dashboard' | 'worker';
  jobId?: string;
  queueName?: string;
  ownerUserIdOverride?: string;
  chunkSize?: number;
  includeDevStack?: boolean;
}

async function loadJobForExecution(
  supabase: SupabaseClient,
  params: { jobId?: string; workerId: string; queueName?: string },
): Promise<LeaseJob | null> {
  if (params.jobId) {
    const existing = await loadLeaseJob(supabase, params.jobId);
    if (!existing) return null;
    return ensureJobProcessingLease(supabase, {
      job: existing,
      workerId: params.workerId,
      queueName: params.queueName,
    });
  }
  return claimNextQueuedJob(supabase, {
    workerId: params.workerId,
    queueName: params.queueName,
  });
}

export async function executeOneImportChunk(params: ExecuteOneChunkParams): Promise<ExecuteEngineResult> {
  const {
    supabase,
    workerId,
    trigger,
    queueName,
    ownerUserIdOverride,
    chunkSize,
    includeDevStack = process.env.NODE_ENV === 'development',
  } = params;

  const job = await loadJobForExecution(supabase, {
    jobId: params.jobId,
    workerId,
    queueName,
  });

  if (!job) {
    return {
      ok: false,
      finished: true,
      processedThisChunk: 0,
      message: params.jobId ? 'Job not claimable for processing.' : 'No queued jobs available.',
    };
  }

  if (!['processing', 'queued', 'retrying'].includes(job.status)) {
    return {
      ok: false,
      finished: true,
      processedThisChunk: 0,
      jobStatus: job.status,
      message: `Job not executable in status ${job.status}.`,
    };
  }

  const executionJobId = job.id;
  const ownerUserId = ownerUserIdOverride ?? job.uploaded_by;
  const effectiveChunkSize = resolveImportChunkSize(chunkSize);

  await heartbeatJob(supabase, {
    jobId: executionJobId,
    workerId,
    metadata: {
      trigger,
      chunk_size: effectiveChunkSize,
    },
  });
  await recoverStaleRowClaims(supabase, executionJobId);

  const claimed = await claimChunk(supabase, {
    jobId: executionJobId,
    workerId,
    chunkSize: effectiveChunkSize,
  });
  if (!claimed || claimed.rowsClaimed === 0) {
    const done = await updateExecutionProgress(supabase, {
      jobId: executionJobId,
      workerId,
      processedThisChunk: 0,
      importedThisChunk: 0,
      failedThisChunk: 0,
      chunkDurationMs: 0,
    });
    if (done.finished) {
      await releaseJobLease(supabase, {
        jobId: executionJobId,
        workerId,
        targetStatus: done.terminalStatus ?? 'completed',
      });
      return {
        ok: true,
        finished: true,
        jobStatus: done.terminalStatus,
        processedThisChunk: 0,
      };
    }
    return {
      ok: true,
      finished: false,
      jobStatus: 'processing',
      processedThisChunk: 0,
      message: 'No claimable rows this tick.',
    };
  }

  const chunkStart = nowMs();
  const rows = await fetchClaimedRows(supabase, { jobId: executionJobId, rowIds: claimed.rowIds });
  let importedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const outcome = await processClaimedRow(supabase, {
      row,
      ownerUserId,
      workerId,
      chunkId: claimed.chunkId,
      jobId: executionJobId,
      includeDevStack,
    });
    if (outcome.state === 'imported') importedCount += 1;
    else if (outcome.state === 'failed') failedCount += 1;
    else skippedCount += 1;
  }

  const chunkDurationMs = Math.max(1, nowMs() - chunkStart);
  await finishChunk(supabase, {
    chunkId: claimed.chunkId,
    workerId,
    rowsImported: importedCount,
    rowsFailed: failedCount,
    status: failedCount > 0 && importedCount === 0 ? 'retrying' : 'completed',
    errorSummary:
      failedCount > 0
        ? `${failedCount} row(s) failed in this chunk; see import_row_attempts.`
        : null,
  });

  const result = await updateExecutionProgress(supabase, {
    jobId: executionJobId,
    workerId,
    processedThisChunk: rows.length,
    importedThisChunk: importedCount,
    failedThisChunk: failedCount,
    chunkDurationMs,
  });

  await heartbeatJob(supabase, {
    jobId: executionJobId,
    workerId,
  });

  if (result.finished) {
    await releaseJobLease(supabase, {
      jobId: executionJobId,
      workerId,
      targetStatus: result.terminalStatus ?? 'completed',
    });
  }

  logWorkerInfo('chunk.processed', {
    job_id: executionJobId,
    chunk_id: claimed.chunkId,
    worker_id: workerId,
    rows_claimed: claimed.rowsClaimed,
    rows_imported: importedCount,
    rows_failed: failedCount,
    rows_skipped: skippedCount,
    duration_ms: chunkDurationMs,
    finished: result.finished,
    terminal_status: result.terminalStatus ?? null,
  });

  return {
    ok: true,
    finished: result.finished,
    jobStatus: result.terminalStatus ?? 'processing',
    processedThisChunk: rows.length,
    chunkId: claimed.chunkId,
    message:
      failedCount > 0
        ? `${failedCount} row(s) failed in this chunk.`
        : result.finished
          ? 'Execution completed.'
          : 'Chunk processed successfully.',
  };
}

export async function runWorkerTick(params: {
  supabase: SupabaseClient;
  workerId: string;
  queueName?: string;
  chunkSize?: number;
}) {
  try {
    return await executeOneImportChunk({
      supabase: params.supabase,
      workerId: params.workerId,
      trigger: 'worker',
      queueName: params.queueName,
      chunkSize: params.chunkSize,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logWorkerError('worker.tick_failed', {
      worker_id: params.workerId,
      queue_name: params.queueName ?? 'default',
      message,
    });
    return {
      ok: false,
      finished: true,
      processedThisChunk: 0,
      message,
    } satisfies ExecuteEngineResult;
  }
}

export async function cancelWorkerLease(
  supabase: SupabaseClient,
  params: { jobId: string; workerId: string },
) {
  try {
    await releaseJobLease(supabase, {
      jobId: params.jobId,
      workerId: params.workerId,
      targetStatus: 'cancelled',
    });
  } catch (e) {
    logWorkerWarn('worker.cancel_lease_failed', {
      job_id: params.jobId,
      worker_id: params.workerId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
