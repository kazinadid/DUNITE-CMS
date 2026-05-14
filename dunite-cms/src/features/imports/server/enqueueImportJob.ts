import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getImportActor } from './importAuth';

export async function enqueueImportJobAction(jobId: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createSupabaseServerClient();
  let user;
  let role;
  try {
    ({ user, role } = await getImportActor(supabase));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, uploaded_by')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) return { ok: false, message: jobErr?.message ?? 'Job not found.' };
  if (job.status !== 'staged') {
    return { ok: false, message: `Only staged imports can be queued (current: «${job.status}»).` };
  }
  if ((job.uploaded_by as string) !== user.id && role !== 'admin') {
    return { ok: false, message: 'Forbidden.' };
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabase.from('import_jobs').select('execution_stats').eq('id', jobId).maybeSingle();
  const prevStats = (existing?.execution_stats ?? {}) as Record<string, unknown>;
  const { data: updated, error } = await supabase
    .from('import_jobs')
    .update({
      status: 'queued',
      queued_at: now,
      execution_stats: {
        ...prevStats,
        enqueued_at: now,
      },
    })
    .eq('id', jobId)
    .eq('status', 'staged')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!updated?.id) {
    return { ok: false, message: 'Job is not staged or was already queued.' };
  }
  return { ok: true };
}
