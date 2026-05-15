import { ImportIssueCode } from './issueCodes';
import { pushIssue } from './issueHelpers';
import type { NormalizedImportRow } from '../types';

/**
 * Converts parser hints into structured validation issues (same codes as row rules).
 */
export function hydrateParseIssues(row: NormalizedImportRow): void {
  const { issues, parseHints } = row;

  for (const token of parseHints.unknownPlatformTokens) {
    pushIssue(
      issues,
      ImportIssueCode.UNKNOWN_PLATFORM_TOKEN,
      'warning',
      `Unknown platform token "${token}" was ignored.`,
      { token },
    );
  }

  if (parseHints.dateHeuristicKey) {
    pushIssue(
      issues,
      ImportIssueCode.DATE_PARSE_HEURISTIC,
      'warning',
      `Date was interpreted using a fallback (${parseHints.dateHeuristicKey}).`,
      { key: parseHints.dateHeuristicKey },
    );
  }

  if (parseHints.dateParseFailed) {
    pushIssue(issues, ImportIssueCode.INVALID_DATE, 'error', 'Could not parse the publish date from this row.', {
      raw: row.publishAtRaw,
    });
  }
}
