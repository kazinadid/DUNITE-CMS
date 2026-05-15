import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { coerceUnknownToUtcDate } from '../../lib/dates';
import { logWorkerError } from './logger';
import type { ClaimedRow, RowExecutionOutcome } from './types';

function pickPostStatus(scheduledAt: Date | null): 'draft' | 'scheduled' {
  if (scheduledAt && scheduledAt.getTime() > Date.now()) return 'scheduled';
  return 'draft';
}

async function insertAttemptStart(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    rowId: string;
    chunkId: string;
    workerId: string;
    attemptNo: number;
    payloadSnapshot: Record<string, unknown>;
  },
): Promise<string | null> {
  const { data } = await supabase
    .from('import_row_attempts')
    .insert({
      job_id: params.jobId,
      row_id: params.rowId,
      chunk_id: params.chunkId,
      worker_id: params.workerId,
      attempt_no: params.attemptNo,
      status: 'processing',
      payload_snapshot: params.payloadSnapshot,
    })
    .select('id')
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function completeAttempt(
  supabase: SupabaseClient,
  params: {
    attemptId: string | null;
    status: 'imported' | 'failed' | 'skipped';
    errorMessage?: string | null;
    errorDetails?: Record<string, unknown> | null;
  },
) {
  if (!params.attemptId) return;
  await supabase
    .from('import_row_attempts')
    .update({
      status: params.status,
      completed_at: new Date().toISOString(),
      error_message: params.errorMessage ?? null,
      error_details: params.errorDetails ?? null,
    })
    .eq('id', params.attemptId);
}

async function markRowFailed(
  supabase: SupabaseClient,
  params: { rowId: string; reason: string; prevRetries: number },
) {
  await supabase
    .from('import_rows')
    .update({
      processing_state: 'failed',
      error_message: params.reason.slice(0, 2000),
      row_execution_retry_count: params.prevRetries + 1,
      last_execution_attempt_at: new Date().toISOString(),
    })
    .eq('id', params.rowId)
    .eq('processing_state', 'importing');
}

export async function processClaimedRow(
  supabase: SupabaseClient,
  params: {
    row: ClaimedRow;
    ownerUserId: string;
    workerId: string;
    chunkId: string;
    jobId: string;
    includeDevStack: boolean;
  },
): Promise<RowExecutionOutcome> {
  const { row, ownerUserId, workerId, chunkId, jobId, includeDevStack } = params;
  const parsed = (row.parsed_data ?? {}) as Record<string, unknown>;
  const prevRetries = row.row_execution_retry_count ?? 0;
  const attemptId = await insertAttemptStart(supabase, {
    jobId,
    rowId: row.id,
    chunkId,
    workerId,
    attemptNo: prevRetries + 1,
    payloadSnapshot: parsed,
  });

  try {
    const content = String(parsed.content ?? parsed.body ?? '').trim();
    const platforms = Array.isArray(parsed.platforms) ? parsed.platforms.map(String).filter(Boolean) : [];
    const mediaUrls = Array.isArray(parsed.media_urls) ? parsed.media_urls.map(String).filter(Boolean) : [];

    if (!content || platforms.length === 0) {
      const reason = 'Missing post text or platforms for import execution.';
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, { attemptId, status: 'failed', errorMessage: reason });
      return { rowId: row.id, state: 'failed', reason };
    }

    const publishDate = parsed.publish_at ? coerceUnknownToUtcDate(parsed.publish_at) : null;
    const status = pickPostStatus(publishDate);

    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        content: content.slice(0, 100_000),
        status,
        scheduled_at: status === 'scheduled' && publishDate ? publishDate.toISOString() : null,
      })
      .select('id')
      .single();

    if (postErr || !post?.id) {
      const reason = (postErr?.message ?? 'Post insert failed').slice(0, 2000);
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, {
        attemptId,
        status: 'failed',
        errorMessage: reason,
        errorDetails: postErr ? { code: postErr.code, details: postErr.details, hint: postErr.hint } : null,
      });
      return { rowId: row.id, state: 'failed', reason };
    }

    const postId = String(post.id);

    const { error: platErr } = await supabase.from('post_platforms').insert(
      platforms.map((platform) => ({
        post_id: postId,
        platform,
      })),
    );
    if (platErr) {
      await supabase.from('posts').delete().eq('id', postId);
      const reason = platErr.message.slice(0, 2000);
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, {
        attemptId,
        status: 'failed',
        errorMessage: reason,
        errorDetails: { code: platErr.code, details: platErr.details, hint: platErr.hint },
      });
      return { rowId: row.id, state: 'failed', reason };
    }

    for (const mediaUrlRaw of mediaUrls.slice(0, 16)) {
      const mediaUrl = mediaUrlRaw.trim();
      if (!mediaUrl) continue;
      await supabase.from('media').insert({
        post_id: postId,
        user_id: ownerUserId,
        url: mediaUrl,
        file_url: mediaUrl,
      });
    }

    const { data: linked, error: linkErr } = await supabase
      .from('import_rows')
      .update({
        post_id: postId,
        processing_state: 'imported',
        error_message: null,
        last_execution_attempt_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('processing_state', 'importing')
      .select('id')
      .maybeSingle();
    if (linkErr || !linked) {
      await supabase.from('posts').delete().eq('id', postId);
      const reason = 'Concurrent execution prevented row attach; generated post was discarded.';
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, { attemptId, status: 'failed', errorMessage: reason });
      return { rowId: row.id, state: 'failed', reason };
    }

    await completeAttempt(supabase, { attemptId, status: 'imported' });
    return { rowId: row.id, state: 'imported', reason: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = includeDevStack && e instanceof Error ? e.stack : undefined;
    await markRowFailed(supabase, {
      rowId: row.id,
      reason: `Unexpected row processing error: ${msg}`.slice(0, 2000),
      prevRetries,
    });
    await completeAttempt(supabase, {
      attemptId,
      status: 'failed',
      errorMessage: msg.slice(0, 2000),
      errorDetails: stack ? { stack } : null,
    });
    logWorkerError('row.unexpected_exception', {
      row_id: row.id,
      job_id: jobId,
      chunk_id: chunkId,
      worker_id: workerId,
      message: msg,
      stack,
    });
    return { rowId: row.id, state: 'failed', reason: msg };
  }
}
