import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { ImportValidationContext } from '../validationContext';
import type { NormalizedImportRow } from '../../types';

const TAG_RE = /^[\p{L}\p{N}_]{1,60}$/u;

export function applyHashtagRules(row: NormalizedImportRow, ctx: ImportValidationContext): void {
  const { issues } = row;

  for (const tag of row.hashtags) {
    const core = tag.replace(/^#+/, '').trim();
    const lower = core.toLowerCase();
    if (!core) continue;

    if (!TAG_RE.test(core)) {
      pushIssue(
        issues,
        ImportIssueCode.MALFORMED_HASHTAG,
        'error',
        `Hashtag "${truncate(tag, 40)}" contains unsupported characters or is too long.`,
        { tag: core },
      );
      continue;
    }

    const first = ctx.hashtagFirstRow.get(lower);
    if (first !== undefined && first !== row.sourceRowIndex) {
      pushIssue(
        issues,
        ImportIssueCode.REPEATED_HASHTAG,
        'warning',
        `Hashtag #${core} also appears on row ${first}.`,
        { tag: core, otherRow: first },
      );
    } else {
      ctx.hashtagFirstRow.set(lower, row.sourceRowIndex);
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
