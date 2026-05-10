import type { PlatformId } from '@/features/composer/types';

/**
 * Canonical shape produced by all file adapters (CSV, XLSX, future JSON).
 * Downstream validation mutates/augments `errors` / `warnings` in place.
 */
export interface NormalizedImportRow {
  sourceRowIndex: number;
  postText: string;
  platforms: PlatformId[];
  /** Parsed instant; `null` when column missing or unparsable. */
  publishAt: Date | null;
  /** When present, the original wall-clock / TZ hint from the sheet (optional). */
  publishAtRaw?: string;
  mediaUrls: string[];
  hashtags: string[];
  /** Original cell payload for audit + re-export. */
  raw: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportParseSummary {
  fileName: string;
  fileType: 'csv' | 'xlsx';
  totalRows: number;
  validRows: number;
  rowsWithErrors: number;
  rowsWithWarnings: number;
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
  | 'error'
  | 'cancelled';

export interface ImportWorkflowState {
  phase: ImportWorkflowPhase;
  progress: number;
  /** Debounced progress shown in UI (0–100). */
  displayProgress: number;
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  rows: NormalizedImportRow[];
  summary: ImportParseSummary | null;
  /** Fatal parser / IO errors (not row-level). */
  fatalMessage: string | null;
}

export type PreviewSlice = {
  start: number;
  end: number;
};
