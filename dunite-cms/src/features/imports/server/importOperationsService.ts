import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import type { ImportJobSortKey, ImportJobTableRow, ImportOperationsSummary } from '../types';
import { getImportActor, getImportListSession } from './importAuth';
import { retryFailedImportRowsAction } from './importJobLifecycleActions';

export interface ListImportJobsPagedParams {
  page: number;
  pageSize: number;
  /** Exact status or empty for all */
  status?: string;
  sortKey: ImportJobSortKey;
  sortDir: 'asc' | 'desc';
  search?: string;
  hideArchived?: boolean;
}

export interface ListImportJobsPagedResult {
  ok: true;
  rows: ImportJobTableRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListImportJobsPagedError {
  ok: false;
  message: string;
}

function assignQueuePositions<T extends { id: string; status: string; created_at: string }>(rows: T[]): Map<string, number> {
  const map = new Map<string, number>();
  const queued = rows
    .filter((r) => r.status === 'queued')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  queued.forEach((r, i) => map.set(r.id, i + 1));
  return map;
}

function durationMs(row: {
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}): number | null {
  const end = row.completed_at ? new Date(row.completed_at).getTime() : null;
  const start = row.started_at ? new Date(row.started_at).getTime() : row.created_at ? new Date(row.created_at).getTime() : null;
  if (start == null || end == null || Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

function uploaderLabel(map: Map<string, { name: string | null; email: string }>, uploadedBy: string): string {
  const u = map.get(uploadedBy);
  if (!u) return uploadedBy.slice(0, 8) + '…';
  const n = u.name?.trim();
  if (n) return n;
  return u.email.split('@')[0] ?? u.email;
}

export async function listImportJobsPagedAction(
  params: ListImportJobsPagedParams,
): Promise<ListImportJobsPagedResult | ListImportJobsPagedError> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase.from('import_jobs').select(
    `
      id,
      file_name,
      status,
      total_rows,
      imported_rows,
      valid_rows,
      invalid_rows,
      duplicate_rows,
      warning_rows,
      created_at,
      updated_at,
      execution_stats,
      queued_at,
      processing_heartbeat_at,
      job_retry_count,
      max_job_retries,
      started_at,
      completed_at,
      uploaded_by,
      metadata
    `,
    { count: 'exact' },
  );

  if (params.status && params.status !== 'all') {
    q = q.eq('status', params.status);
  }

  const s = params.search?.trim();
  if (s) {
    q = q.ilike('file_name', `%${s.replace(/%/g, '\\%')}%`);
  }

  if (params.hideArchived) {
    q = q.not('metadata', 'cs', { archived: true });
  }

  const ascending = params.sortDir === 'asc';
  const col = params.sortKey;
  q = q.order(col, { ascending, nullsFirst: false });

  const { data, error, count } = await q.range(from, to);

  if (error) return { ok: false, message: error.message };

  const raw = (data ?? []) as Array<
    ImportJobTableRow & { uploaded_by: string; metadata?: Record<string, unknown> | null }
  >;

  const uploaderIds = [...new Set(raw.map((r) => r.uploaded_by).filter(Boolean))];
  const uploaderMap = new Map<string, { name: string | null; email: string }>();
  if (uploaderIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, name, email').in('id', uploaderIds);
    for (const u of users ?? []) {
      uploaderMap.set(u.id as string, { name: (u.name as string | null) ?? null, email: u.email as string });
    }
  }

  const qpos = assignQueuePositions(raw);

  const rows: ImportJobTableRow[] = raw.map((r) => ({
    ...r,
    uploader_label: uploaderLabel(uploaderMap, r.uploaded_by),
    queue_position: r.status === 'queued' ? qpos.get(r.id) ?? null : null,
    duration_ms: durationMs(r),
  }));

  return {
    ok: true,
    rows,
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getImportOperationsSummaryAction(): Promise<
  { ok: true; summary: ImportOperationsSummary } | ListImportJobsPagedError
> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const { count: importsToday } = await supabase
    .from('import_jobs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso);

  const { count: completedToday } = await supabase
    .from('import_jobs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .eq('status', 'completed');

  const { count: failedPartialToday } = await supabase
    .from('import_jobs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .in('status', ['failed', 'partial_success']);

  const { data: sample } = await supabase
    .from('import_jobs')
    .select('status, duplicate_rows, invalid_rows, started_at, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const list = sample ?? [];
  const durations: number[] = [];
  let dupSum = 0;
  let invSum = 0;
  for (const r of list) {
    dupSum += (r.duplicate_rows as number) ?? 0;
    invSum += (r.invalid_rows as number) ?? 0;
    const d = durationMs(r as { started_at?: string; completed_at?: string; created_at?: string });
    if (d != null) durations.push(d);
  }
  const avg =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const terminal = list.filter((r) =>
    ['completed', 'failed', 'partial_success'].includes(r.status as string),
  );
  const completedN = terminal.filter((r) => r.status === 'completed').length;
  const badN = terminal.filter((r) => r.status !== 'completed').length;
  const successRate =
    completedN + badN > 0 ? Math.round((completedN / (completedN + badN)) * 1000) / 10 : null;

  return {
    ok: true,
    summary: {
      imports_today: importsToday ?? 0,
      completed_today: completedToday ?? 0,
      failed_or_partial_today: failedPartialToday ?? 0,
      avg_duration_ms_sample: avg,
      duplicate_rows_sum_sample: dupSum,
      invalid_rows_sum_sample: invSum,
      success_rate_recent: successRate,
      sample_size: list.length,
    },
  };
}

const OPS_STATUS_BUCKETS = [
  'queued',
  'processing',
  'staged',
  'staging',
  'failed',
  'partial_success',
  'completed',
  'cancelled',
] as const;

export type ImportStatusCountKey = (typeof OPS_STATUS_BUCKETS)[number];

export async function getImportJobStatusCountsAction(): Promise<
  { ok: true; counts: Record<string, number> } | ListImportJobsPagedError
> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const entries = await Promise.all(
    OPS_STATUS_BUCKETS.map(async (status) => {
      const { count, error } = await supabase
        .from('import_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      if (error) return [status, 0] as const;
      return [status, count ?? 0] as const;
    }),
  );

  const counts: Record<string, number> = {};
  for (const [k, v] of entries) counts[k] = v;
  return { ok: true, counts };
}

export async function bulkCancelImportJobsAction(
  jobIds: string[],
): Promise<{ ok: boolean; cancelled?: number; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportActor(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const ids = [...new Set(jobIds)].filter(Boolean).slice(0, 50);
  if (ids.length === 0) return { ok: true, cancelled: 0 };

  const { data, error } = await supabase
    .from('import_jobs')
    .update({ status: 'cancelled' })
    .in('id', ids)
    .in('status', ['uploaded', 'validated', 'staging', 'staged', 'queued', 'processing'])
    .select('id');

  if (error) return { ok: false, message: error.message };
  return { ok: true, cancelled: data?.length ?? 0 };
}

export async function bulkArchiveImportJobsAction(
  jobIds: string[],
): Promise<{ ok: boolean; archived?: number; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportActor(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const ids = [...new Set(jobIds)].filter(Boolean).slice(0, 50);
  if (ids.length === 0) return { ok: true, archived: 0 };

  let archived = 0;
  for (const id of ids) {
    const { data: row } = await supabase.from('import_jobs').select('metadata').eq('id', id).maybeSingle();
    const prev = (row?.metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from('import_jobs')
      .update({
        metadata: {
          ...prev,
          archived: true,
          archived_at: new Date().toISOString(),
        },
      })
      .eq('id', id);
    if (!error) archived += 1;
  }
  return { ok: true, archived };
}

export async function bulkRetryImportJobsAction(
  jobIds: string[],
): Promise<{ ok: boolean; retried?: number; failures?: string[]; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportActor(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }
  const ids = [...new Set(jobIds)].filter(Boolean).slice(0, 20);
  if (ids.length === 0) return { ok: true, retried: 0, failures: [] };

  const failures: string[] = [];
  let retried = 0;
  for (const id of ids) {
    const res = await retryFailedImportRowsAction(id);
    if (res.ok && (res.reset ?? 0) > 0) retried += 1;
    else if (!res.ok) failures.push(`${id.slice(0, 8)}: ${res.message ?? 'skip'}`);
  }
  return { ok: true, retried, failures };
}

export async function getImportJobDetailAction(jobId: string): Promise<
  | {
      ok: true;
      job: ImportJobTableRow;
      failure_sample: { row_number: number; error_message: string | null }[];
    }
  | ListImportJobsPagedError
> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const { data: row, error } = await supabase
    .from('import_jobs')
    .select(
      `
      id,
      file_name,
      status,
      total_rows,
      imported_rows,
      valid_rows,
      invalid_rows,
      duplicate_rows,
      warning_rows,
      created_at,
      updated_at,
      execution_stats,
      queued_at,
      processing_heartbeat_at,
      job_retry_count,
      max_job_retries,
      started_at,
      completed_at,
      uploaded_by,
      metadata,
      error_summary
    `,
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error || !row) return { ok: false, message: error?.message ?? 'Job not found.' };

  let queuePosition: number | null = null;
  if ((row.status as string) === 'queued') {
    const { data: pos } = await supabase.rpc('import_job_queue_position', { p_job_id: jobId });
    queuePosition = typeof pos === 'number' ? pos : pos != null ? Number(pos) : null;
  }

  const uploadedBy = row.uploaded_by as string;
  const { data: u } = await supabase.from('users').select('id, name, email').eq('id', uploadedBy).maybeSingle();
  const uploaderMap = new Map<string, { name: string | null; email: string }>();
  if (u) uploaderMap.set(u.id as string, { name: u.name as string | null, email: u.email as string });

  const job: ImportJobTableRow = {
    ...(row as ImportJobTableRow),
    uploaded_by: uploadedBy,
    uploader_label: uploaderLabel(uploaderMap, uploadedBy),
    queue_position: queuePosition,
    duration_ms: durationMs(row as { started_at?: string; completed_at?: string; created_at?: string }),
  };

  const { data: fails } = await supabase
    .from('import_rows')
    .select('row_number, error_message')
    .eq('import_job_id', jobId)
    .eq('processing_state', 'failed')
    .order('row_number', { ascending: true })
    .limit(80);

  return {
    ok: true,
    job,
    failure_sample: (fails ?? []).map((r) => ({
      row_number: r.row_number as number,
      error_message: r.error_message as string | null,
    })),
  };
}
