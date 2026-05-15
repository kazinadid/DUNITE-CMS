import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { NormalizedImportRow } from '../../types';

const VERY_LONG = 8000;

/** Extra UX warning for extremely long captions (export / editor strain). */
export function applyLongCaptionRule(row: NormalizedImportRow): void {
  if (row.postText.length >= VERY_LONG) {
    pushIssue(
      row.issues,
      ImportIssueCode.LONG_CAPTION,
      'warning',
      `Caption is very long (${row.postText.length} characters). Consider splitting into multiple posts.`,
      { length: row.postText.length },
    );
  }
}
