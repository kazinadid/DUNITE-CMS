import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { coerceUnknownToUtcDate } from '../../lib/dates';
import { logWorkerError } from './logger';
import {
  fileNameFromUrl,
  inferMediaKindFromUrl,
  inferMimeFromUrl,
  mergeContentWithHashtags,
  normalizeHashtags,
  normalizeMediaUrls,
  normalizePlatformTokens,
} from './rowTransforms';
import type { ClaimedRow, RowExecutionOutcome } from './types';

type PostWritableStatus = 'queued' | 'scheduled';

function pickPostStatus(scheduledAt: Date | null): PostWritableStatus {
  if (scheduledAt && scheduledAt.getTime() > Date.now()) return 'scheduled';
  return 'queued';
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

function nowIso(): string {
  return new Date().toISOString();
}

async function markRowSkipped(
  supabase: SupabaseClient,
  params: { rowId: string; reason: string },
) {
  await supabase
    .from('import_rows')
    .update({
      processing_state: 'failed',
      error_message: params.reason.slice(0, 2000),
      last_execution_attempt_at: nowIso(),
    })
    .eq('id', params.rowId)
    .eq('processing_state', 'importing');
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
      last_execution_attempt_at: nowIso(),
    })
    .eq('id', params.rowId)
    .eq('processing_state', 'importing');
}

interface LibraryMediaRow {
  id: string;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  thumbnail_url?: string | null;
  thumbnail_path?: string | null;
  size?: number | null;
  width_px?: number | null;
  height_px?: number | null;
}

async function ensurePublishingJobs(
  supabase: SupabaseClient,
  params: {
    postId: string;
    platforms: string[];
    scheduledAt: string | null;
    workerId: string;
    sourceRowNumber: number;
  },
): Promise<{ publishingReady: number }> {
  const { postId, platforms, scheduledAt, workerId, sourceRowNumber } = params;
  const scheduleFor = scheduledAt ?? nowIso();

  const rpc = await supabase.rpc('replace_publishing_jobs', { p_post_id: postId });
  if (!rpc.error) {
    const { data: jobs } = await supabase
      .from('publishing_jobs')
      .select('id')
      .eq('post_id', postId)
      .in('status', ['queued', 'retrying']);
    return { publishingReady: jobs?.length ?? 0 };
  }

  const fallback = await supabase
    .from('publishing_jobs')
    .upsert(
      platforms.map((platform) => ({
        post_id: postId,
        platform,
        status: 'queued',
        scheduled_for: scheduleFor,
        last_error: null,
      })),
      { onConflict: 'post_id,platform' },
    )
    .select('id');
  if (fallback.error) {
    throw new Error(
      `Publishing job queue sync failed (rpc=${rpc.error.message}; upsert=${fallback.error.message})`,
    );
  }

  await supabase.from('publishing_logs').insert({
    post_id: postId,
    event_type: 'import_row_queued',
    message: `Import row #${sourceRowNumber} produced publishing-ready jobs.`,
    metadata: {
      worker_id: workerId,
      scheduled_for: scheduleFor,
      imported_platforms: platforms,
    },
  });

  return { publishingReady: fallback.data?.length ?? 0 };
}

async function ensureLibraryMediaRows(
  supabase: SupabaseClient,
  params: {
    ownerUserId: string;
    mediaUrls: string[];
  },
): Promise<Map<string, LibraryMediaRow>> {
  const { ownerUserId, mediaUrls } = params;
  const out = new Map<string, LibraryMediaRow>();
  if (mediaUrls.length === 0) return out;

  const { data: existing, error: existingErr } = await supabase
    .from('media')
    .select('id,file_url,file_type,file_name,mime_type,storage_path,thumbnail_url,thumbnail_path,size,width_px,height_px')
    .eq('user_id', ownerUserId)
    .eq('is_library', true)
    .in('file_url', mediaUrls);
  if (existingErr) {
    throw new Error(`Failed to query reusable media rows: ${existingErr.message}`);
  }
  for (const row of existing ?? []) {
    const key = String(row.file_url ?? '').trim();
    if (!key) continue;
    out.set(key, row as LibraryMediaRow);
  }

  const missing = mediaUrls.filter((url) => !out.has(url));
  if (missing.length > 0) {
    const toInsert = missing.map((url) => ({
      post_id: null,
      user_id: ownerUserId,
      is_library: true,
      url,
      file_url: url,
      file_name: fileNameFromUrl(url),
      file_type: inferMediaKindFromUrl(url),
      mime_type: inferMimeFromUrl(url),
      storage_path: null,
    }));
    const inserted = await supabase
      .from('media')
      .insert(toInsert)
      .select('id,file_url,file_type,file_name,mime_type,storage_path,thumbnail_url,thumbnail_path,size,width_px,height_px');
    if (inserted.error) {
      throw new Error(`Library media insert failed: ${inserted.error.message}`);
    }
    for (const row of inserted.data ?? []) {
      const key = String(row.file_url ?? '').trim();
      if (!key) continue;
      out.set(key, row as LibraryMediaRow);
    }
  }

  return out;
}

async function attachMediaToPost(
  supabase: SupabaseClient,
  params: {
    postId: string;
    ownerUserId: string;
    urls: string[];
    libraryRows: Map<string, LibraryMediaRow>;
  },
): Promise<number> {
  const { postId, ownerUserId, urls, libraryRows } = params;
  if (urls.length === 0) return 0;

  const { data: existingOnPost, error: existingErr } = await supabase
    .from('media')
    .select('file_url')
    .eq('post_id', postId)
    .in('file_url', urls);
  if (existingErr) {
    throw new Error(`Failed checking existing post media: ${existingErr.message}`);
  }
  const existingSet = new Set((existingOnPost ?? []).map((m) => String(m.file_url ?? '')));
  const toAttach = urls.filter((url) => !existingSet.has(url));
  if (toAttach.length === 0) return 0;

  const inserts = toAttach.map((url, index) => {
    const src = libraryRows.get(url);
    return {
      post_id: postId,
      user_id: ownerUserId,
      is_library: false,
      url,
      file_url: url,
      file_name: src?.file_name ?? fileNameFromUrl(url),
      file_type: src?.file_type ?? inferMediaKindFromUrl(url),
      mime_type: src?.mime_type ?? inferMimeFromUrl(url),
      storage_path: src?.storage_path ?? null,
      thumbnail_url: src?.thumbnail_url ?? null,
      thumbnail_path: src?.thumbnail_path ?? null,
      size: src?.size ?? null,
      width_px: src?.width_px ?? null,
      height_px: src?.height_px ?? null,
      order_index: index,
    };
  });

  const { error } = await supabase.from('media').insert(inserts);
  if (error) {
    throw new Error(`Post media attach failed: ${error.message}`);
  }
  return inserts.length;
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
    const rawContent = String(parsed.content ?? parsed.body ?? '').trim();
    const normalizedPlatforms = normalizePlatformTokens(parsed.platforms);
    const platforms = normalizedPlatforms.platforms;
    const hashtags = normalizeHashtags(parsed.hashtags, rawContent);
    const content = mergeContentWithHashtags(rawContent, hashtags);
    const mediaUrls = normalizeMediaUrls(parsed.media_urls).slice(0, 24);

    if (!content) {
      const reason = 'Missing post text or platforms for import execution.';
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, { attemptId, status: 'failed', errorMessage: reason });
      return { rowId: row.id, state: 'failed', reason };
    }
    if (platforms.length === 0) {
      const reason =
        normalizedPlatforms.unknownTokens.length > 0
          ? `No supported platforms after normalization. Unknown: ${normalizedPlatforms.unknownTokens.join(', ')}`
          : 'No supported platform mappings were provided.';
      await markRowSkipped(supabase, { rowId: row.id, reason });
      await completeAttempt(supabase, {
        attemptId,
        status: 'skipped',
        errorMessage: reason,
        errorDetails: {
          unknown_platform_tokens: normalizedPlatforms.unknownTokens,
          source_row_number: row.row_number,
        },
      });
      return { rowId: row.id, state: 'skipped', reason };
    }

    const publishDate = parsed.publish_at ? coerceUnknownToUtcDate(parsed.publish_at) : null;
    const status = pickPostStatus(publishDate);
    const scheduledAt = status === 'scheduled' && publishDate ? publishDate.toISOString() : null;
    const rowStartMs = Date.now();

    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: ownerUserId,
        content: content.slice(0, 100_000),
        status,
        scheduled_at: scheduledAt,
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

    let mediaAttached = 0;
    try {
      const libraryRows = await ensureLibraryMediaRows(supabase, {
        ownerUserId,
        mediaUrls,
      });
      mediaAttached = await attachMediaToPost(supabase, {
        postId,
        ownerUserId,
        urls: mediaUrls,
        libraryRows,
      });
    } catch (mediaErr) {
      await supabase.from('posts').delete().eq('id', postId);
      const reason =
        mediaErr instanceof Error ? mediaErr.message.slice(0, 2000) : 'Media attach failed unexpectedly';
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, { attemptId, status: 'failed', errorMessage: reason });
      return { rowId: row.id, state: 'failed', reason };
    }

    let publishingReadyCount = 0;
    try {
      const publishing = await ensurePublishingJobs(supabase, {
        postId,
        platforms,
        scheduledAt,
        workerId,
        sourceRowNumber: row.row_number,
      });
      publishingReadyCount = publishing.publishingReady;
    } catch (publishQueueErr) {
      await supabase.from('posts').delete().eq('id', postId);
      const reason =
        publishQueueErr instanceof Error
          ? publishQueueErr.message.slice(0, 2000)
          : 'Publishing queue preparation failed';
      await markRowFailed(supabase, { rowId: row.id, reason, prevRetries });
      await completeAttempt(supabase, { attemptId, status: 'failed', errorMessage: reason });
      return { rowId: row.id, state: 'failed', reason };
    }

    const { data: linked, error: linkErr } = await supabase
      .from('import_rows')
      .update({
        post_id: postId,
        processing_state: 'imported',
        error_message: null,
        last_execution_attempt_at: nowIso(),
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

    const elapsedMs = Math.max(1, Date.now() - rowStartMs);
    await completeAttempt(supabase, {
      attemptId,
      status: 'imported',
      errorDetails: {
        post_id: postId,
        normalized_platforms: platforms,
        unknown_platform_tokens: normalizedPlatforms.unknownTokens,
        hashtag_count: hashtags.length,
        hashtags,
        media_urls_received: mediaUrls.length,
        media_attached: mediaAttached,
        publishing_ready_jobs: publishingReadyCount,
        scheduled_at: scheduledAt,
        post_status: status,
        execution_ms: elapsedMs,
      },
    });
    return {
      rowId: row.id,
      state: 'imported',
      reason: null,
      postId,
      scheduled: status === 'scheduled',
      publishingReady: publishingReadyCount > 0,
      platformsLinked: platforms.length,
      mediaAttached,
    };
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
