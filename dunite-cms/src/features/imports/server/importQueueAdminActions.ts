import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getImportActor } from './importAuth';

/** Re-queues stale `processing` jobs (admin-only; uses DB SECURITY DEFINER RPC). */
export async function requeueStaleImportJobsAdminAction(
  heartbeatMinutes = 30,
): Promise<{ ok: boolean; message?: string; requeued?: number }> {
  const supabase = await createSupabaseServerClient();
  try {
    const { role } = await getImportActor(supabase);
    if (role !== 'admin') {
      return { ok: false, message: 'Only administrators can recover stale import workers.' };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const interval = `${Math.max(5, Math.min(180, heartbeatMinutes))} minutes`;
  const { data, error } = await supabase.rpc('import_jobs_requeue_stale_processing', {
    p_heartbeat_age: interval,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, requeued: typeof data === 'number' ? data : Number(data) };
}
