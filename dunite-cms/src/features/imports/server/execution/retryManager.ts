import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logWorkerInfo } from './logger';

export async function recoverStaleRowClaims(supabase: SupabaseClient, jobId: string): Promise<number> {
  const { data, error } = await supabase.rpc('import_rows_recover_stale_claims', {
    p_job_id: jobId,
    p_max_age: '25 minutes',
  });
  const recovered = typeof data === 'number' ? data : Number(data ?? 0);
  if (!error && recovered > 0) {
    logWorkerInfo('retry.recovered_stale_row_claims', {
      job_id: jobId,
      recovered_rows: recovered,
    });
  }
  return error ? 0 : recovered;
}

export async function markJobRetrying(
  supabase: SupabaseClient,
  params: { jobId: string; workerId: string; reason: string },
): Promise<void> {
  const { jobId, workerId, reason } = params;
  await supabase.rpc('import_job_worker_release', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_target_status: 'retrying',
    p_error_summary: reason.slice(0, 1800),
  });
}
