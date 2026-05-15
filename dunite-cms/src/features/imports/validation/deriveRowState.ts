import { ImportIssueCode } from './issueCodes';
import type { RowValidationState, ValidationIssue } from './validationTypes';

const DUPLICATE_CODES: Set<string> = new Set([
  ImportIssueCode.DUPLICATE_CONTENT,
  ImportIssueCode.DUPLICATE_MEDIA_URL,
  ImportIssueCode.DUPLICATE_SCHEDULE,
]);

/**
 * Maps issue list → aggregate row state for UI + future import_rows.processing_state.
 */
export function deriveRowValidationState(issues: ValidationIssue[]): RowValidationState {
  const errs = issues.filter((i) => i.severity === 'error');
  if (errs.some((e) => e.code === ImportIssueCode.EMPTY_IMPORT_ROW)) {
    return 'skipped';
  }
  if (errs.length > 0) {
    return 'invalid';
  }

  const dups = issues.filter((i) => DUPLICATE_CODES.has(i.code));
  if (dups.length > 0) {
    return 'duplicate';
  }

  const warns = issues.filter((i) => i.severity === 'warning');
  if (warns.length > 0) {
    return 'warning';
  }

  return 'valid';
}

export function assignRowStates(rows: { issues: ValidationIssue[]; validationState: RowValidationState }[]): void {
  for (const row of rows) {
    row.validationState = deriveRowValidationState(row.issues);
  }
}
