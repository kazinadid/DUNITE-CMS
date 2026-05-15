import { ImportIssueCode } from '../validation/issueCodes';

import type { NormalizedImportRow } from '../types';
import type { RowValidationState } from '../validation/validationTypes';

export type ImportPreviewFilterMode =
  | 'all'
  | RowValidationState
  | 'has_errors'
  | 'has_warnings'
  | 'duplicate_signal';

const DUPLICATE_CODES = new Set<string>([
  ImportIssueCode.DUPLICATE_CONTENT,
  ImportIssueCode.DUPLICATE_MEDIA_URL,
  ImportIssueCode.DUPLICATE_SCHEDULE,
]);

function rowMatchesFilter(row: NormalizedImportRow, mode: ImportPreviewFilterMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'has_errors') return row.issues.some((i) => i.severity === 'error');
  if (mode === 'has_warnings') return row.issues.some((i) => i.severity === 'warning');
  if (mode === 'duplicate_signal') {
    return row.validationState === 'duplicate' || row.issues.some((i) => DUPLICATE_CODES.has(i.code));
  }
  if (mode === 'valid' || mode === 'warning' || mode === 'duplicate' || mode === 'invalid' || mode === 'skipped') {
    return row.validationState === mode;
  }
  return true;
}

function rowMatchesSearch(row: NormalizedImportRow, q: string): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  const hay = [
    String(row.sourceRowIndex),
    row.postText,
    row.platforms.join(' '),
    row.hashtags.join(' '),
    row.mediaUrls.join(' '),
    ...row.issues.map((i) => `${i.code} ${i.message}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(n);
}

/**
 * Applies exclusion set, validation filter, and debounced search (call with already-debounced query).
 */
export function filterImportPreviewRows(
  rows: readonly NormalizedImportRow[],
  opts: {
    excludedSourceIndices: ReadonlySet<number>;
    filterMode: ImportPreviewFilterMode;
    searchQuery: string;
  },
): NormalizedImportRow[] {
  const { excludedSourceIndices, filterMode, searchQuery } = opts;
  return rows.filter(
    (r) =>
      !excludedSourceIndices.has(r.sourceRowIndex) &&
      rowMatchesFilter(r, filterMode) &&
      rowMatchesSearch(r, searchQuery),
  );
}
