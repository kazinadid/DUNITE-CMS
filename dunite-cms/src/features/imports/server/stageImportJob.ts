import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportPreviewPayload } from '../preview/prepareImportPreview';
import { getImportActor } from './importAuth';
import { normalizedRowToImportRowPayload } from './importPayloadMapper';

const MAX_STAGE_ROWS = 10_000;
const INSERT_CHUNK = 150;

export interface StageImportJobResult {
  ok: true;
  jobId: string;
}

export interface StageImportJobError {
  ok: false;
  message: string;
}

export type StageImportJobResponse = StageImportJobResult | StageImportJobError;

/**
 * Persists a validated client preview into `import_jobs` + `import_rows`, runs
 * duplicate detection RPCs, then marks the job `staged` (ready for execution chunks).
 */
export async function stageImportJobAction(
  payload: ImportPreviewPayload,
  opts: { fileName: string; fileType: string | null },
): Promise<StageImportJobResponse> {
  if (payload.version !== 1) {
    return { ok: false, message: 'Unsupported import payload version.' };
  }
  if (payload.rows.length === 0) {
    return { ok: false, message: 'Nothing to stage.' };
  }
  if (payload.rows.length > MAX_STAGE_ROWS) {
    return { ok: false, message: `Too many rows to stage in one job (max ${MAX_STAGE_ROWS.toLocaleString()}).` };
  }

  const supabase = await createSupabaseServerClient();
  let user;
  try {
    ({ user } = await getImportActor(supabase));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      uploaded_by: user.id,
      file_name: opts.fileName.slice(0, 520),
      file_type: opts.fileType ? opts.fileType.slice(0, 200) : null,
      upload_source: 'dashboard',
      status: 'staging',
      metadata: {
        timezone: payload.timezone,
        preview_version: payload.version,
        client_generated_at: payload.generatedAt,
      },
    })
    .select('id')
    .single();

  if (jobErr || !job?.id) {
    return { ok: false, message: jobErr?.message ?? 'Failed to create import job.' };
  }

  const jobId = job.id as string;

  for (let i = 0; i < payload.rows.length; i += INSERT_CHUNK) {
    const slice = payload.rows.slice(i, i + INSERT_CHUNK);
    const rows = slice.map((r) => {
      const p = normalizedRowToImportRowPayload(r);
      return {
        import_job_id: jobId,
        row_number: p.row_number,
        parsed_data: p.parsed_data,
        validation_errors: p.validation_errors,
        warnings: p.warnings,
        duplicate_flags: p.duplicate_flags,
        processing_state: p.processing_state,
      };
    });
    const { error: insErr } = await supabase.from('import_rows').insert(rows);
    if (insErr) {
      await supabase.from('import_jobs').delete().eq('id', jobId);
      return { ok: false, message: insErr.message };
    }
  }

  const { error: statErr } = await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });
  if (statErr) {
    return { ok: false, message: statErr.message };
  }

  await supabase.rpc('import_job_mark_duplicates_within_job', {
    p_job_id: jobId,
    p_from_states: ['valid', 'warning'],
  });
  await supabase.rpc('import_job_mark_duplicates_existing_posts', { p_job_id: jobId });
  await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

  const { error: finErr } = await supabase.from('import_jobs').update({ status: 'staged' }).eq('id', jobId);
  if (finErr) {
    return { ok: false, message: finErr.message };
  }

  return { ok: true, jobId };
}
