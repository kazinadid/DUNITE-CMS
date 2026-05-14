import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportExecutionStats, ImportJobProgressPayload } from '../types';
import { getImportListSession } from './importAuth';

export async function getImportJobProgressAction(
  jobId: string,
): Promise<{ ok: boolean; progress?: ImportJobProgressPayload; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const { data: job, error } = await supabase
    .from('import_jobs')
    .select(
      'id, status, file_name, total_rows, imported_rows, valid_rows, invalid_rows, duplicate_rows, warning_rows, execution_stats, queued_at, processing_heartbeat_at, job_retry_count, max_job_retries, created_at, started_at, completed_at',
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error || !job) return { ok: false, message: error?.message ?? 'Job not found.' };

  const { count: pendingImportable, error: pendErr } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .in('processing_state', ['valid', 'warning'])
    .is('post_id', null);

  const { count: importingCount } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .eq('processing_state', 'importing');

  if (pendErr) {
    return { ok: false, message: pendErr.message };
  }

  const total = job.total_rows ?? 0;
  const pending = (pendingImportable ?? 0) + (importingCount ?? 0);
  const doneWork = Math.max(0, total - pending);
  const progressPct = total > 0 ? Math.min(100, Math.round((doneWork / total) * 100)) : 0;

  let queuePosition: number | null = null;
  if (job.status === 'queued') {
    const { data: pos } = await supabase.rpc('import_job_queue_position', { p_job_id: jobId });
    queuePosition = typeof pos === 'number' ? pos : pos != null ? Number(pos) : null;
  }

  const stats = (job.execution_stats ?? {}) as ImportExecutionStats;

  const progress: ImportJobProgressPayload = {
    id: job.id as string,
    file_name: job.file_name as string,
    status: job.status as string,
    total_rows: total,
    imported_rows: job.imported_rows ?? 0,
    valid_rows: job.valid_rows ?? 0,
    invalid_rows: job.invalid_rows ?? 0,
    duplicate_rows: job.duplicate_rows ?? 0,
    warning_rows: job.warning_rows ?? 0,
    pending_importable: pendingImportable ?? 0,
    importing_rows: importingCount ?? 0,
    progress_pct: progressPct,
    execution_stats: stats,
    queued_at: (job.queued_at as string | null) ?? null,
    processing_heartbeat_at: (job.processing_heartbeat_at as string | null) ?? null,
    job_retry_count: job.job_retry_count ?? 0,
    max_job_retries: job.max_job_retries ?? 12,
    queue_position: queuePosition,
    created_at: job.created_at as string,
    started_at: (job.started_at as string | null) ?? null,
    completed_at: (job.completed_at as string | null) ?? null,
  };

  return { ok: true, progress };
}
