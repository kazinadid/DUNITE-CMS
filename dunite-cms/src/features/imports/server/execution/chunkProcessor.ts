import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { logWorkerWarn } from './logger';
import type { ClaimedChunk, ClaimedRow } from './types';

type ChunkRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

function parseClaimedIds(metadata: Record<string, unknown> | null): string[] {
  const ids = metadata?.claimed_row_ids;
  if (!Array.isArray(ids)) return [];
  return ids
    .map((x) => String(x))
    .filter((x) => x.length > 0);
}

export async function claimChunk(
  supabase: SupabaseClient,
  params: { jobId: string; workerId: string; chunkSize: number },
): Promise<ClaimedChunk | null> {
  const { jobId, workerId, chunkSize } = params;
  const { data, error } = await supabase.rpc('import_job_chunk_start', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_chunk_size: chunkSize,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.chunk_id) return null;
  const chunkId = String(row.chunk_id);
  const { data: chunk } = await supabase
    .from('import_job_chunks')
    .select('id,metadata')
    .eq('id', chunkId)
    .maybeSingle();
  const claimedIds = parseClaimedIds((chunk as ChunkRow | null)?.metadata ?? null);
  return {
    chunkId,
    rowsClaimed: Number(row.rows_claimed ?? 0),
    fromRow: row.from_row != null ? Number(row.from_row) : null,
    toRow: row.to_row != null ? Number(row.to_row) : null,
    rowIds: claimedIds,
  };
}

export async function fetchClaimedRows(
  supabase: SupabaseClient,
  params: { jobId: string; rowIds: string[] },
): Promise<ClaimedRow[]> {
  const { jobId, rowIds } = params;
  if (rowIds.length === 0) return [];
  const { data, error } = await supabase
    .from('import_rows')
    .select('id,row_number,parsed_data,processing_state,row_execution_retry_count')
    .eq('import_job_id', jobId)
    .in('id', rowIds)
    .order('row_number', { ascending: true });
  if (error) {
    logWorkerWarn('chunk.fetch_claimed_rows_failed', {
      job_id: jobId,
      row_count: rowIds.length,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as ClaimedRow[];
}

export async function finishChunk(
  supabase: SupabaseClient,
  params: {
    chunkId: string;
    workerId: string;
    rowsImported: number;
    rowsFailed: number;
    status: 'completed' | 'failed' | 'retrying' | 'cancelled';
    errorSummary?: string | null;
  },
): Promise<void> {
  const { chunkId, workerId, rowsImported, rowsFailed, status, errorSummary } = params;
  await supabase.rpc('import_job_chunk_finish', {
    p_chunk_id: chunkId,
    p_worker_id: workerId,
    p_rows_imported: rowsImported,
    p_rows_failed: rowsFailed,
    p_status: status,
    p_error_summary: errorSummary ?? null,
  });
}
