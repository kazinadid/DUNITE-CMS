import { coerceUnknownToUtcDate } from '../../lib/dates';
import { fingerprintContent, fingerprintMediaUrls, fingerprintScheduleAndContent } from '../../lib/fingerprints';
import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { ImportValidationContext } from '../validationContext';
import type { NormalizedImportRow } from '../../types';

type FirstSeen = { rowIndex: number; mediaFp: string };

/**
 * O(n) duplicate detection using content / composite fingerprints.
 */
export function applyCrossRowDuplicateRules(
  rows: NormalizedImportRow[],
  _ctx: ImportValidationContext,
): void {
  const contentFirst = new Map<string, number>();
  const mediaFirst = new Map<string, number>();
  const scheduleFirst = new Map<string, number>();
  const urlOwners = new Map<string, number>();

  for (const row of rows) {
    if (row.issues.some((i) => i.severity === 'error' && i.code === ImportIssueCode.EMPTY_IMPORT_ROW)) {
      continue;
    }

    const cfp = fingerprintContent(row.postText);
    const prevC = contentFirst.get(cfp);
    if (prevC !== undefined && prevC !== row.sourceRowIndex) {
      pushIssue(
        row.issues,
        ImportIssueCode.DUPLICATE_CONTENT,
        'warning',
        `Duplicate caption vs row ${prevC} (same normalized text).`,
        { otherRow: prevC },
      );
    } else if (row.postText.trim().length > 0) {
      contentFirst.set(cfp, row.sourceRowIndex);
    }

    if (row.mediaUrls.length > 0) {
      const mfp = fingerprintMediaUrls(row.mediaUrls);
      const prevM = mediaFirst.get(mfp);
      if (prevM !== undefined && prevM !== row.sourceRowIndex) {
        pushIssue(
          row.issues,
          ImportIssueCode.DUPLICATE_MEDIA_URL,
          'warning',
          `Same media set as row ${prevM}.`,
          { otherRow: prevM },
        );
      } else {
        mediaFirst.set(mfp, row.sourceRowIndex);
      }
    }

    const scheduled = coerceUnknownToUtcDate(row.publishAt);
    const sfp = fingerprintScheduleAndContent(row.publishAt, cfp);
    const prevS = scheduleFirst.get(sfp);
    if (prevS !== undefined && prevS !== row.sourceRowIndex && scheduled) {
      pushIssue(
        row.issues,
        ImportIssueCode.DUPLICATE_SCHEDULE,
        'warning',
        `Same schedule slot and caption fingerprint as row ${prevS}.`,
        { otherRow: prevS },
      );
    } else if (scheduled) {
      scheduleFirst.set(sfp, row.sourceRowIndex);
    }

    for (const url of row.mediaUrls) {
      const key = url.trim().toLowerCase();
      const owner = urlOwners.get(key);
      if (owner !== undefined && owner !== row.sourceRowIndex) {
        pushIssue(
          row.issues,
          ImportIssueCode.REUSED_MEDIA_ACROSS_ROWS,
          'warning',
          `Media URL reused from row ${owner}.`,
          { url: truncateUrl(url), otherRow: owner },
        );
      } else {
        urlOwners.set(key, row.sourceRowIndex);
      }
    }
  }
}

function truncateUrl(u: string): string {
  return u.length > 100 ? `${u.slice(0, 100)}…` : u;
}
