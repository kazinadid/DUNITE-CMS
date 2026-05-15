import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { NormalizedImportRow } from '../../types';

/**
 * Empty / whitespace-only rows, missing platforms, missing content.
 */
export function applyRequiredRules(row: NormalizedImportRow): void {
  const { issues } = row;
  const text = row.postText;
  const trimmed = text.trim();
  const isEmptyLine =
    trimmed.length === 0 &&
    row.platforms.length === 0 &&
    row.mediaUrls.length === 0 &&
    row.hashtags.length === 0 &&
    row.publishAt === null &&
    !row.publishAtRaw;

  if (isEmptyLine) {
    pushIssue(issues, ImportIssueCode.EMPTY_IMPORT_ROW, 'error', 'This row is empty — nothing to import.');
    return;
  }

  if (trimmed.length === 0 && (row.platforms.length > 0 || row.mediaUrls.length > 0 || row.publishAt)) {
    pushIssue(
      issues,
      ImportIssueCode.WHITESPACE_ONLY,
      'error',
      'Post text is missing or whitespace-only while other fields are set.',
    );
    return;
  }

  if (trimmed.length === 0) {
    pushIssue(issues, ImportIssueCode.MISSING_CONTENT, 'error', 'Post text is required.');
    return;
  }

  if (row.platforms.length === 0) {
    pushIssue(issues, ImportIssueCode.MISSING_PLATFORMS, 'error', 'Select at least one supported platform.');
  }
}
