import type { PlatformId } from '@/features/composer/types';

import type { RowValidationState, ValidationIssue } from './validation/validationTypes';

import type { ImportCanonicalField } from './lib/importFieldSchema';

/** File-level blocker: recognized headers do not satisfy required campaign columns. */
export interface ImportSchemaFailure {
  missingRequired: ImportCanonicalField[];
  detectedRawHeaders: string[];
}

/** Parser-level hints replayed into structured issues by the validation engine. */
export interface RowParseHints {
  unknownPlatformTokens: string[];
  /** When set, date parsing used a heuristic path. */
  dateHeuristicKey?: string;
  /** User supplied a date string we could not parse. */
  dateParseFailed?: boolean;
}

/**
 * Canonical shape produced by file adapters. Stays in browser until an explicit
 * server action persists `import_jobs` / `import_rows` — never auto-writes posts.
 */
export interface NormalizedImportRow {
  sourceRowIndex: number;
  postText: string;
  platforms: PlatformId[];
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
  [key: string]: unknown;
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
