import type { SupabaseClient } from '@supabase/supabase-js';

export type ImportJobLifecycleStatus =
  | 'uploaded'
  | 'validating'
  | 'validated'
  | 'staging'
  | 'staged'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial_success'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export type ImportRowState =
  | 'valid'
  | 'invalid'
  | 'warning'
  | 'duplicate'
  | 'imported'
  | 'failed'
  | 'importing';

export interface ExecutionRuntimeContext {
  supabase: SupabaseClient;
  jobId: string;
  workerId: string;
  trigger: 'dashboard' | 'worker';
  chunkSize: number;
}

export interface LeaseJob {
  id: string;
  status: ImportJobLifecycleStatus;
  uploaded_by: string;
  queue_name?: string | null;
  worker_claim_id?: string | null;
  execution_stats?: Record<string, unknown> | null;
}

export interface ClaimedChunk {
  chunkId: string;
  rowsClaimed: number;
  fromRow: number | null;
  toRow: number | null;
  rowIds: string[];
}

export interface ClaimedRow {
  id: string;
  row_number: number;
  parsed_data: Record<string, unknown>;
  processing_state: ImportRowState;
  row_execution_retry_count?: number | null;
}

export interface RowExecutionOutcome {
  rowId: string;
  state: 'imported' | 'failed' | 'skipped';
  reason: string | null;
}

export interface ChunkExecutionOutcome {
  chunkId: string;
  claimedCount: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  outcomes: RowExecutionOutcome[];
}

export interface ExecuteEngineResult {
  ok: boolean;
  finished: boolean;
  jobStatus?: ImportJobLifecycleStatus;
  processedThisChunk: number;
  message?: string;
  chunkId?: string;
}
