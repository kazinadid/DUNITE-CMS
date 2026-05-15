import type { ImportIssueCode } from './issueCodes';

export type IssueSeverity = 'error' | 'warning';

/**
 * Single validation finding. Rows collect many issues; severity drives row state.
 */
export interface ValidationIssue {
  code: ImportIssueCode;
  severity: IssueSeverity;
  message: string;
  /** Optional machine context (e.g. platform id, URL). */
  meta?: Record<string, string | number | boolean | undefined>;
}

/**
 * Terminal row classification after the pipeline (import_jobs.import_rows alignment).
 */
export type RowValidationState = 'valid' | 'warning' | 'duplicate' | 'invalid' | 'skipped';
