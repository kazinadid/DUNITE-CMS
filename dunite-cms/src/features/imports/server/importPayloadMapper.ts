import type { NormalizedImportRow } from '../types';
import type { ValidationIssue } from '../validation/validationTypes';
import { publishAtToIsoOrNull } from '../lib/dates';
import { ImportIssueCode } from '../validation/issueCodes';

const DUPLICATE_ISSUE_CODES = new Set<string>([
  ImportIssueCode.DUPLICATE_CONTENT,
  ImportIssueCode.DUPLICATE_MEDIA_URL,
  ImportIssueCode.DUPLICATE_SCHEDULE,
]);

/**
 * Maps client-normalized rows into `import_rows` JSONB columns + processing_state.
 * Shapes align with `import_row_content_for_match` (`content` / `body`) and
 * duplicate fingerprint helpers (`fingerprints`, `import_key`, etc.).
 */
export function normalizedRowToImportRowPayload(row: NormalizedImportRow): {
  row_number: number;
  parsed_data: Record<string, unknown>;
  validation_errors: ValidationIssue[];
  warnings: ValidationIssue[];
  duplicate_flags: Record<string, unknown>;
  processing_state: 'valid' | 'invalid' | 'warning' | 'duplicate';
} {
  const errors = row.issues.filter((i) => i.severity === 'error');
  const warnings = row.issues.filter((i) => i.severity === 'warning');

  const processing_state: 'valid' | 'invalid' | 'warning' | 'duplicate' =
    row.validationState === 'skipped' ? 'invalid' : row.validationState;

  const parsed_data: Record<string, unknown> = {
    content: row.postText,
    body: row.postText,
    platforms: row.platforms,
    publish_at: publishAtToIsoOrNull(row.publishAt),
    publish_at_raw: row.publishAtRaw ?? null,
    media_urls: row.mediaUrls,
    hashtags: row.hashtags,
    source_row_index: row.sourceRowIndex,
    parse_hints: row.parseHints,
    fingerprints: row.fingerprints ?? null,
  };

  const duplicate_flags: Record<string, unknown> = {
    client_validation_state: row.validationState,
    duplicate_issue_codes: row.issues.filter((i) => DUPLICATE_ISSUE_CODES.has(i.code)).map((i) => i.code),
  };

  return {
    row_number: row.sourceRowIndex,
    parsed_data,
    validation_errors: errors,
    warnings,
    duplicate_flags,
    processing_state,
  };
}
