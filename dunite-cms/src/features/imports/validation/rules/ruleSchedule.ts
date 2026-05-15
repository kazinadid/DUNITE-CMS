import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { ImportValidationContext } from '../validationContext';
import type { NormalizedImportRow } from '../../types';

const SOON_MS = 5 * 60 * 1000;

export function applyScheduleRules(row: NormalizedImportRow, ctx: ImportValidationContext): void {
  if (!row.publishAt) return;
  const { issues } = row;
  const delta = row.publishAt.getTime() - ctx.now.getTime();
  if (delta >= 0 && delta < SOON_MS) {
    pushIssue(
      issues,
      ImportIssueCode.SCHEDULE_VERY_SOON,
      'warning',
      'Scheduled time is within the next 5 minutes — confirm this is intentional.',
      { at: row.publishAt.toISOString() },
    );
  }
  if (row.publishAt.getTime() < ctx.now.getTime() - 60_000) {
    pushIssue(
      issues,
      ImportIssueCode.INVALID_DATE,
      'warning',
      'Publish time is in the past. It may still be saved as draft depending on your workflow.',
      { at: row.publishAt.toISOString() },
    );
  }
}
