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
