import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportJobListItem } from '../types';
import { getImportActor, getImportListSession } from './importAuth';

export async function cancelImportJobAction(jobId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportActor(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const { error } = await supabase
    .from('import_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .in('status', ['uploaded', 'validated', 'staging', 'staged', 'queued', 'processing']);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function listRecentImportJobsAction(
  limit = 15,
): Promise<{ ok: boolean; jobs?: ImportJobListItem[]; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const { data, error } = await supabase
    .from('import_jobs')
    .select(
      'id, file_name, status, total_rows, imported_rows, valid_rows, invalid_rows, duplicate_rows, warning_rows, created_at, updated_at, execution_stats, queued_at, processing_heartbeat_at, job_retry_count, max_job_retries, started_at, completed_at',
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));

  if (error) return { ok: false, message: error.message };
  return { ok: true, jobs: (data ?? []) as ImportJobListItem[] };
}

export async function retryFailedImportRowsAction(
  jobId: string,
): Promise<{ ok: boolean; message?: string; reset?: number }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportActor(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const { data: job } = await supabase
    .from('import_jobs')
    .select('status, job_retry_count, max_job_retries')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return { ok: false, message: 'Job not found.' };
  if (!['failed', 'partial_success', 'completed'].includes(job.status as string)) {
    return { ok: false, message: 'Retry is only available after a finished execution attempt.' };
  }

  const retries = (job.job_retry_count as number) ?? 0;
  const maxRetries = (job.max_job_retries as number) ?? 12;
  if (retries >= maxRetries) {
    return { ok: false, message: 'Maximum retry cycles reached for this import job.' };
  }

  const { data: failed, error: selErr } = await supabase
    .from('import_rows')
    .select('id')
    .eq('import_job_id', jobId)
    .in('processing_state', ['failed', 'importing']);

  if (selErr) return { ok: false, message: selErr.message };
  const ids = (failed ?? []).map((r) => r.id);
  if (ids.length === 0) return { ok: true, reset: 0 };

  const { error: upErr } = await supabase
    .from('import_rows')
    .update({ processing_state: 'valid', error_message: null, post_id: null })
    .in('id', ids);

  if (upErr) return { ok: false, message: upErr.message };

  const now = new Date().toISOString();
  const { data: prevRow } = await supabase.from('import_jobs').select('execution_stats').eq('id', jobId).maybeSingle();
  const prevStats = (prevRow?.execution_stats ?? {}) as Record<string, unknown>;

  await supabase
    .from('import_jobs')
    .update({
      status: 'queued',
      queued_at: now,
      completed_at: null,
      error_summary: null,
      job_retry_count: retries + 1,
      execution_stats: {
        ...prevStats,
        retry_rows_at: now,
        retry_rows_count: ids.length,
      },
    })
    .eq('id', jobId);

  await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

  return { ok: true, reset: ids.length };
}
