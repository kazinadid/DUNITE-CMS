import { ImportIssueCode } from './issueCodes';
import type { NormalizedImportRow } from '../types';

export function isRowSkippedEmpty(row: NormalizedImportRow): boolean {
  return row.issues.some((i) => i.code === ImportIssueCode.EMPTY_IMPORT_ROW);
}
