import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getImportActor } from './importAuth';

const CHUNK = 40;

export interface ExecuteImportChunkResult {
  ok: boolean;
  message?: string;
  finished: boolean;
  jobStatus?: string;
  /** Rows touched in this invocation */
  processedThisChunk: number;
}

function pickPostStatus(scheduledAt: Date | null): 'draft' | 'scheduled' {
  if (scheduledAt && scheduledAt.getTime() > Date.now()) {
    return 'scheduled';
  }
  return 'draft';
}

/**
 * Processes up to `CHUNK` import_rows that are still importable (valid|warning, no post).
 * Idempotent across calls until the job reaches a terminal status.
 */
export async function executeImportJobChunkAction(jobId: string): Promise<ExecuteImportChunkResult> {
  const supabase = await createSupabaseServerClient();
  let user;
  let role;
  try {
    ({ user, role } = await getImportActor(supabase));
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unauthorized.',
      finished: true,
      processedThisChunk: 0,
    };
  }

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, uploaded_by')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, message: jobErr?.message ?? 'Job not found.', finished: true, processedThisChunk: 0 };
  }

  if (!['staged', 'processing'].includes(job.status as string)) {
    return {
      ok: false,
      message: `Job is not executable in status «${job.status}».`,
      finished: true,
      jobStatus: job.status as string,
      processedThisChunk: 0,
    };
  }

  if ((job.uploaded_by as string) !== user.id && role !== 'admin') {
    return { ok: false, message: 'Forbidden.', finished: true, processedThisChunk: 0 };
  }

  if (job.status === 'staged') {
    const { error: stErr } = await supabase.from('import_jobs').update({ status: 'processing' }).eq('id', jobId);
    if (stErr) {
      return { ok: false, message: stErr.message, finished: false, processedThisChunk: 0 };
    }
  }

  const { data: batch, error: rowErr } = await supabase
    .from('import_rows')
    .select('id, parsed_data, processing_state')
    .eq('import_job_id', jobId)
    .in('processing_state', ['valid', 'warning'])
    .is('post_id', null)
    .order('row_number', { ascending: true })
    .limit(CHUNK);

  if (rowErr) {
    return { ok: false, message: rowErr.message, finished: false, processedThisChunk: 0 };
  }

  const rows = batch ?? [];
  let processed = 0;

  for (const row of rows) {
    processed += 1;
    const pd = (row.parsed_data ?? {}) as Record<string, unknown>;
    const content = String(pd.content ?? pd.body ?? '').trim();
    const platforms = Array.isArray(pd.platforms) ? (pd.platforms as string[]).filter(Boolean) : [];
    const mediaUrls = Array.isArray(pd.media_urls) ? (pd.media_urls as string[]).filter(Boolean) : [];

    if (!content || platforms.length === 0) {
      await supabase
        .from('import_rows')
        .update({
          processing_state: 'failed',
          error_message: 'Missing post text or platforms for import execution.',
        })
        .eq('id', row.id);
      continue;
    }

    let scheduledAt: Date | null = null;
    if (pd.publish_at) {
      const d = new Date(String(pd.publish_at));
      if (!Number.isNaN(d.getTime())) scheduledAt = d;
    }

    const postStatus = pickPostStatus(scheduledAt);

    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        content: content.slice(0, 100_000),
        status: postStatus,
        scheduled_at: postStatus === 'scheduled' && scheduledAt ? scheduledAt.toISOString() : null,
      })
      .select('id')
      .single();

    if (postErr || !post?.id) {
      await supabase
        .from('import_rows')
        .update({
          processing_state: 'failed',
          error_message: (postErr?.message ?? 'Post insert failed').slice(0, 2000),
        })
        .eq('id', row.id);
      continue;
    }

    const postId = post.id as string;

    const platformRows = platforms.map((platform) => ({
      post_id: postId,
      platform,
    }));
    const { error: platErr } = await supabase.from('post_platforms').insert(platformRows);
    if (platErr) {
      await supabase.from('posts').delete().eq('id', postId);
      await supabase
        .from('import_rows')
        .update({
          processing_state: 'failed',
          error_message: platErr.message.slice(0, 2000),
        })
        .eq('id', row.id);
      continue;
    }

    for (const url of mediaUrls.slice(0, 12)) {
      const u = String(url).trim();
      if (!u) continue;
      await supabase.from('media').insert({
        post_id: postId,
        user_id: user.id,
        url: u,
        file_url: u,
      });
    }

    await supabase
      .from('import_rows')
      .update({
        post_id: postId,
        processing_state: 'imported',
        error_message: null,
      })
      .eq('id', row.id);
  }

  await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

  const { count: remCount, error: pendErr } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .in('processing_state', ['valid', 'warning'])
    .is('post_id', null);

  if (pendErr) {
    return { ok: true, finished: false, processedThisChunk: processed, message: pendErr.message };
  }

  if ((remCount ?? 0) === 0) {
    const { data: states } = await supabase.from('import_rows').select('processing_state').eq('import_job_id', jobId);
    const list = states ?? [];
    const failed = list.filter((r) => r.processing_state === 'failed').length;
    const imported = list.filter((r) => r.processing_state === 'imported').length;

    let terminal: 'completed' | 'partial_success' | 'failed' = 'completed';
    if (failed > 0 && imported > 0) terminal = 'partial_success';
    else if (failed > 0 && imported === 0) terminal = 'failed';

    const stats = {
      processed: list.length,
      succeeded: imported,
      failed,
      skipped_duplicate: list.filter((r) => r.processing_state === 'duplicate').length,
      skipped_invalid: list.filter((r) => r.processing_state === 'invalid').length,
    };

    await supabase
      .from('import_jobs')
      .update({
        status: terminal,
        execution_stats: stats,
        error_summary:
          terminal === 'failed'
            ? 'No rows could be imported. See import_rows for row-level errors.'
            : terminal === 'partial_success'
              ? 'Some rows failed during import execution.'
              : null,
      })
      .eq('id', jobId);

    return { ok: true, finished: true, jobStatus: terminal, processedThisChunk: processed };
  }

  return { ok: true, finished: false, jobStatus: 'processing', processedThisChunk: processed };
}
