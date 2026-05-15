import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logWorkerInfo, logWorkerWarn } from './logger';
import type { LeaseJob } from './types';

const STALE_INTERVAL = '25 minutes';

export async function loadLeaseJob(supabase: SupabaseClient, jobId: string): Promise<LeaseJob | null> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('id,status,uploaded_by,queue_name,worker_claim_id,execution_stats')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !data) return null;
  return data as LeaseJob;
}

export async function claimNextQueuedJob(
  supabase: SupabaseClient,
  params: { workerId: string; queueName?: string },
): Promise<LeaseJob | null> {
  const { workerId, queueName } = params;
  const { data, error } = await supabase.rpc('import_job_worker_claim_next', {
    p_worker_id: workerId,
    p_queue_name: queueName ?? 'default',
    p_stale_after: STALE_INTERVAL,
  });
  if (error) {
    logWorkerWarn('queue.claim_next_failed', {
      worker_id: workerId,
      queue_name: queueName ?? 'default',
      error,
    });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.job_id) return null;
  return loadLeaseJob(supabase, String(row.job_id));
}

export async function ensureJobProcessingLease(
  supabase: SupabaseClient,
  params: { job: LeaseJob; workerId: string; queueName?: string },
): Promise<LeaseJob | null> {
  const { job, workerId, queueName } = params;

  if (job.status === 'queued' || job.status === 'retrying') {
    const { error } = await supabase
      .from('import_jobs')
      .update({
        status: 'processing',
        queue_name: queueName ?? job.queue_name ?? 'default',
        worker_claim_id: workerId,
        processing_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .in('status', ['queued', 'retrying']);
    if (error) return null;
    return loadLeaseJob(supabase, job.id);
  }

  if (job.status !== 'processing') return null;

  if (job.worker_claim_id && job.worker_claim_id !== workerId) {
    logWorkerWarn('queue.lease_owned_by_other_worker', {
      job_id: job.id,
      worker_id: workerId,
      owner_worker_id: job.worker_claim_id,
    });
    return null;
  }

  if (!job.worker_claim_id) {
    const { error } = await supabase
      .from('import_jobs')
      .update({
        worker_claim_id: workerId,
        processing_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'processing');
    if (error) return null;
  }

  return loadLeaseJob(supabase, job.id);
}

export async function heartbeatJob(
  supabase: SupabaseClient,
  params: { jobId: string; workerId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const { jobId, workerId, metadata } = params;
  const { data, error } = await supabase.rpc('import_job_worker_heartbeat', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_metadata: metadata ?? {},
  });
  if (error || data !== true) {
    logWorkerWarn('queue.heartbeat_failed', {
      job_id: jobId,
      worker_id: workerId,
      error: error?.message ?? null,
      data,
    });
    return;
  }
  logWorkerInfo('queue.heartbeat_ok', { job_id: jobId, worker_id: workerId });
}

export async function releaseJobLease(
  supabase: SupabaseClient,
  params: { jobId: string; workerId: string; targetStatus: string; errorSummary?: string | null },
): Promise<void> {
  const { jobId, workerId, targetStatus, errorSummary } = params;
  const { data, error } = await supabase.rpc('import_job_worker_release', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_target_status: targetStatus,
    p_error_summary: errorSummary ?? null,
  });
  if (error || data !== true) {
    logWorkerWarn('queue.release_failed', {
      job_id: jobId,
      worker_id: workerId,
      target_status: targetStatus,
      error: error?.message ?? null,
      data,
    });
  }
}
