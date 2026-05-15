import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportExecutionStats } from '../types';
import { coerceUnknownToUtcDate } from '../lib/dates';
import { getImportActor } from './importAuth';
import { resolveImportChunkSize } from './importQueueConstants';

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

type ClaimedRow = {
  id: string;
  parsed_data: unknown;
  processing_state: string;
  row_execution_retry_count?: number | null;
};

/**
 * Queue-safe chunk processor: claims rows via `import_rows_claim_execution_batch`
 * (SKIP LOCKED + transient `importing` state), creates posts idempotently, and
 * updates rolling `execution_stats` for polling UIs.
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

  const chunkSize = resolveImportChunkSize();

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, uploaded_by, execution_stats')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, message: jobErr?.message ?? 'Job not found.', finished: true, processedThisChunk: 0 };
  }

  if ((job.uploaded_by as string) !== user.id && role !== 'admin') {
    return { ok: false, message: 'Forbidden.', finished: true, processedThisChunk: 0 };
  }

  if (job.status === 'staged') {
    return {
      ok: false,
      message: 'Queue this import before running execution chunks.',
      finished: true,
      jobStatus: 'staged',
      processedThisChunk: 0,
    };
  }

  if (!['queued', 'processing'].includes(job.status as string)) {
    return {
      ok: false,
      message: `Job is not executable in status «${job.status}».`,
      finished: true,
      jobStatus: job.status as string,
      processedThisChunk: 0,
    };
  }

  await supabase.rpc('import_rows_recover_stale_claims', {
    p_job_id: jobId,
    p_max_age: '25 minutes',
  });

  if (job.status === 'queued') {
    const { error: qErr } = await supabase
      .from('import_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId)
      .eq('status', 'queued');
    if (qErr) {
      return { ok: false, message: qErr.message, finished: false, processedThisChunk: 0 };
    }
  }

  const { data: jobAfter, error: afterErr } = await supabase
    .from('import_jobs')
    .select('status')
    .eq('id', jobId)
    .maybeSingle();
  if (afterErr || jobAfter?.status !== 'processing') {
    return {
      ok: false,
      message: 'Unable to acquire processing lease for this job.',
      finished: true,
      processedThisChunk: 0,
    };
  }

  const { data: claimed, error: claimErr } = await supabase.rpc('import_rows_claim_execution_batch', {
    p_job_id: jobId,
    p_limit: chunkSize,
  });

  if (claimErr) {
    return { ok: false, message: claimErr.message, finished: false, processedThisChunk: 0 };
  }

  const rows = (claimed ?? []) as ClaimedRow[];
  let processed = 0;

  for (const row of rows) {
    processed += 1;
    const pd = (row.parsed_data ?? {}) as Record<string, unknown>;
    const content = String(pd.content ?? pd.body ?? '').trim();
    const platforms = Array.isArray(pd.platforms) ? (pd.platforms as string[]).filter(Boolean) : [];
    const mediaUrls = Array.isArray(pd.media_urls) ? (pd.media_urls as string[]).filter(Boolean) : [];

    const prevRetries = row.row_execution_retry_count ?? 0;

    if (!content || platforms.length === 0) {
      await supabase
        .from('import_rows')
        .update({
          processing_state: 'failed',
          error_message: 'Missing post text or platforms for import execution.',
          row_execution_retry_count: prevRetries + 1,
        })
        .eq('id', row.id)
        .eq('processing_state', 'importing');
      continue;
    }

    let scheduledAt: Date | null = null;
    if (pd.publish_at) {
      const d = coerceUnknownToUtcDate(pd.publish_at);
      if (d) scheduledAt = d;
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
          row_execution_retry_count: prevRetries + 1,
        })
        .eq('id', row.id)
        .eq('processing_state', 'importing');
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
          row_execution_retry_count: prevRetries + 1,
        })
        .eq('id', row.id)
        .eq('processing_state', 'importing');
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

    const { data: linked, error: linkErr } = await supabase
      .from('import_rows')
      .update({
        post_id: postId,
        processing_state: 'imported',
        error_message: null,
      })
      .eq('id', row.id)
      .eq('processing_state', 'importing')
      .select('id')
      .maybeSingle();

    if (linkErr || !linked) {
      await supabase.from('posts').delete().eq('id', postId);
      await supabase
        .from('import_rows')
        .update({
          processing_state: 'failed',
          error_message: 'Concurrent import prevented double attach; post discarded.',
          row_execution_retry_count: prevRetries + 1,
        })
        .eq('id', row.id)
        .eq('processing_state', 'importing');
    }
  }

  await supabase.rpc('import_jobs_recompute_row_statistics', { p_job_id: jobId });

  const { data: statsRow } = await supabase.from('import_jobs').select('execution_stats').eq('id', jobId).maybeSingle();
  const prevExec = (statsRow?.execution_stats ?? job.execution_stats ?? {}) as ImportExecutionStats;
  const chunksDone = (prevExec.chunks_completed ?? 0) + 1;
  const nowIso = new Date().toISOString();
  const mergedStats: ImportExecutionStats = {
    ...prevExec,
    chunks_completed: chunksDone,
    last_chunk_at: nowIso,
    last_chunk_rows: processed,
    last_heartbeat_at: nowIso,
  };

  await supabase
    .from('import_jobs')
    .update({
      processing_heartbeat_at: nowIso,
      execution_stats: mergedStats as unknown as Record<string, unknown>,
    })
    .eq('id', jobId);

  const { count: remCount, error: pendErr } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .in('processing_state', ['valid', 'warning'])
    .is('post_id', null);

  const { count: importingRem, error: impErr } = await supabase
    .from('import_rows')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .eq('processing_state', 'importing');

  if (pendErr || impErr) {
    return {
      ok: true,
      finished: false,
      processedThisChunk: processed,
      message: pendErr?.message ?? impErr?.message,
    };
  }

  if ((remCount ?? 0) === 0 && (importingRem ?? 0) === 0) {
    const { data: states } = await supabase.from('import_rows').select('processing_state').eq('import_job_id', jobId);
    const list = states ?? [];
    const failed = list.filter((r) => r.processing_state === 'failed').length;
    const imported = list.filter((r) => r.processing_state === 'imported').length;

    let terminal: 'completed' | 'partial_success' | 'failed' = 'completed';
    if (failed > 0 && imported > 0) terminal = 'partial_success';
    else if (failed > 0 && imported === 0) terminal = 'failed';

    const { data: jobFull } = await supabase
      .from('import_jobs')
      .select('started_at')
      .eq('id', jobId)
      .maybeSingle();
    const startedAt = jobFull?.started_at ? new Date(jobFull.started_at as string).getTime() : null;
    const durationMs =
      startedAt != null && !Number.isNaN(startedAt) ? Math.max(0, Date.now() - startedAt) : undefined;

    const stats = {
      ...mergedStats,
      processed: list.length,
      succeeded: imported,
      failed,
      skipped_duplicate: list.filter((r) => r.processing_state === 'duplicate').length,
      skipped_invalid: list.filter((r) => r.processing_state === 'invalid').length,
      terminal_at: nowIso,
      processing_duration_ms: durationMs,
    };

    await supabase
      .from('import_jobs')
      .update({
        status: terminal,
        execution_stats: stats as unknown as Record<string, unknown>,
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
