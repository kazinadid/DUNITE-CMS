import type { PlatformId } from '@/features/composer/types';

import type { RowValidationState, ValidationIssue } from './validation/validationTypes';

import type { ImportCanonicalField } from './lib/importFieldSchema';

/** File-level blocker: recognized headers do not satisfy required campaign columns. */
export interface ImportSchemaFailure {
  missingRequired: ImportCanonicalField[];
  detectedRawHeaders: string[];
}

/** Original cell + normalization outcome for import date diagnostics. */
export interface ImportDateParseDiagnostics {
  original: string;
  normalizedIso?: string | null;
  reasonCode?: string;
  reason?: string;
}

/** Parser-level hints replayed into structured issues by the validation engine. */
export interface RowParseHints {
  unknownPlatformTokens: string[];
  /** When set, date parsing used a heuristic path. */
  dateHeuristicKey?: string;
  /** User supplied a date string we could not parse. */
  dateParseFailed?: boolean;
  /** Original cell, normalized UTC ISO when known, and failure reason. */
  dateParseDiagnostics?: ImportDateParseDiagnostics;
}

/**
 * Canonical shape produced by file adapters. Stays in browser until an explicit
 * server action persists `import_jobs` / `import_rows` — never auto-writes posts.
 */
export interface NormalizedImportRow {
  sourceRowIndex: number;
  postText: string;
  platforms: PlatformId[];
  /** Resolved instant (UTC). At runtime may be an ISO string after JSON — coerce before formatting. */
  publishAt: Date | null;
  publishAtRaw?: string;
  mediaUrls: string[];
  hashtags: string[];
  raw: Record<string, unknown>;
  parseHints: RowParseHints;
  issues: ValidationIssue[];
  validationState: RowValidationState;
  /** Client-side fingerprints for duplicate UX; server can recompute. */
  fingerprints?: {
    content: string;
    mediaSet: string;
    scheduleContent: string;
  };
}

export interface ImportValidationSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  duplicateRows: number;
  skippedRows: number;
  /** Rows that can proceed without fixing blocking errors (valid + warning + duplicate without error). */
  stagingReadyRows: number;
  readinessPct: number;
  errorsByCode: Record<string, number>;
  warningsByCode: Record<string, number>;
}

export interface ImportParseSummary {
  fileName: string;
  fileType: 'csv' | 'xlsx';
  totalRows: number;
  /** Legacy rollups — prefer `validation`. */
  validRows: number;
  rowsWithErrors: number;
  rowsWithWarnings: number;
  validation: ImportValidationSummary;
  parseFatalError: string | null;
  durationMs: number;
}

export type ImportWorkflowPhase =
  | 'idle'
  | 'reading'
  | 'parsing'
  | 'normalizing'
  | 'validating'
  | 'ready'
  | 'schema_blocked'
  | 'error'
  | 'cancelled';

export interface ImportWorkflowState {
  phase: ImportWorkflowPhase;
  progress: number;
  displayProgress: number;
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  rows: NormalizedImportRow[];
  summary: ImportParseSummary | null;
  fatalMessage: string | null;
  /** When rows were not validated because headers failed schema checks. */
  schemaFailure: ImportSchemaFailure | null;
}

export type PreviewSlice = {
  start: number;
  end: number;
};

/** Server-persisted counters / queue hints (see migration `execution_stats`). */
export interface ImportExecutionStats {
  processed?: number;
  succeeded?: number;
  failed?: number;
  skipped_duplicate?: number;
  skipped_invalid?: number;
  chunks_completed?: number;
  last_chunk_at?: string;
  last_chunk_rows?: number;
  last_heartbeat_at?: string;
  terminal_at?: string;
  processing_duration_ms?: number;
  enqueued_at?: string;
  retry_rows_at?: string;
  retry_rows_count?: number;
  worker_id?: string;
  last_chunk_duration_ms?: number;
  rows_per_second?: number;
  queue_latency_ms?: number;
  [key: string]: unknown;
}

export interface ImportJobChunkLog {
  id: string;
  job_id: string;
  chunk_index: number;
  worker_id: string;
  queue_name: string;
  status: 'claimed' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  claimed_at: string;
  started_at: string | null;
  completed_at: string | null;
  rows_claimed: number;
  rows_imported: number;
  rows_failed: number;
  retry_count: number;
  duration_ms: number | null;
  error_summary: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ImportRowAttemptLog {
  id: string;
  job_id: string;
  row_id: string;
  chunk_id: string | null;
  worker_id: string;
  attempt_no: number;
  status: 'processing' | 'imported' | 'failed' | 'skipped' | 'cancelled';
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  error_details?: Record<string, unknown> | null;
}

/** Polling payload for active import execution UI. */
export interface ImportJobProgressPayload {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  imported_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  warning_rows: number;
  pending_importable: number;
  importing_rows: number;
  progress_pct: number;
  execution_stats: ImportExecutionStats;
  queued_at: string | null;
  processing_heartbeat_at: string | null;
  job_retry_count: number;
  max_job_retries: number;
  queue_position: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  rows_per_second: number | null;
  eta_seconds: number | null;
  worker_id: string | null;
  last_chunk_duration_ms: number | null;
  last_chunk_rows: number | null;
  chunk_failures: number;
}

export interface ImportFailureGroup {
  error_message: string;
  count: number;
}

export interface ImportOperationsSummary {
  imports_today: number;
  completed_today: number;
  failed_or_partial_today: number;
  avg_duration_ms_sample: number | null;
  duplicate_rows_sum_sample: number;
  invalid_rows_sum_sample: number;
  success_rate_recent: number | null;
  sample_size: number;
}

/** Server list projection for import job history UI. */
export interface ImportJobListItem {
  id: string;
  file_name: string;
  status: string;
  total_rows: number | null;
  imported_rows: number | null;
  valid_rows: number | null;
  invalid_rows: number | null;
  duplicate_rows: number | null;
  warning_rows?: number | null;
  created_at: string;
  updated_at: string;
  execution_stats?: ImportExecutionStats | null;
  queued_at?: string | null;
  processing_heartbeat_at?: string | null;
  job_retry_count?: number | null;
  max_job_retries?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export type ImportJobSortKey = 'created_at' | 'file_name' | 'status' | 'imported_rows';

/** Operations table + detail — extends list row with uploader and derived queue metrics. */
export interface ImportJobTableRow extends ImportJobListItem {
  uploaded_by: string;
  uploader_label: string;
  queue_position: number | null;
  duration_ms: number | null;
  metadata?: Record<string, unknown> | null;
  error_summary?: string | null;
}

/** Serialized PostgREST / Supabase error for staging diagnostics (client + server logs). */
export interface SupabaseErrorSnapshot {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
}

/**
 * Structured staging diagnostics returned to the client in development / when staging fails.
 * Safe for logs — avoid shipping huge row payloads in production responses if tightened later.
 */
export interface ImportStagingDiagnostics {
  phase:
    | 'precheck'
    | 'auth'
    | 'db_role'
    | 'job_insert'
    | 'rows_insert'
    | 'stats'
    | 'finalize'
    | 'unexpected';
  timestamp: string;
  auth_uid: string;
  app_role: string;
  db_current_user_role: string | null;
  db_role_rpc_error: SupabaseErrorSnapshot | null;
  insert_job_payload: Record<string, unknown> | null;
  inserted_job: { id: string; status?: string; total_rows?: number; uploaded_by?: string } | null;
  job_insert_error: SupabaseErrorSnapshot | null;
  rows_insert_error: SupabaseErrorSnapshot | null;
  rows_chunk: { from_row: number; to_row: number; count: number } | null;
  /** First rows of the failing chunk (truncated JSON) for import_rows failures. */
  failing_rows_sample: unknown[] | null;
  stats_error: SupabaseErrorSnapshot | null;
  finalize_error: SupabaseErrorSnapshot | null;
  unexpected_message: string | null;
}

export interface StageImportJobSuccess {
  ok: true;
  jobId: string;
  stagedRows: number;
  totalRows: number;
}

export interface StageImportJobFailure {
  ok: false;
  message: string;
  /** Structured diagnostics for operators (includes Supabase error code/message/details/hint when available). */
  diagnostics?: ImportStagingDiagnostics;
}

export type StageImportJobResponse = StageImportJobSuccess | StageImportJobFailure;
