import { PLATFORMS } from '@/features/composer/lib/platforms';
import type { PlatformId } from '@/features/composer/types';

import { ImportIssueCode } from '../issueCodes';
import { pushIssue } from '../issueHelpers';
import type { NormalizedImportRow } from '../../types';

export function applyPlatformLimitRules(row: NormalizedImportRow): void {
  const text = row.postText;
  const { issues } = row;

  for (const p of row.platforms) {
    const cfg = PLATFORMS[p as PlatformId];
    if (!cfg) continue;

    if (text.length > cfg.hardLimit) {
      pushIssue(
        issues,
        ImportIssueCode.CONTENT_EXCEEDS_PLATFORM_HARD,
        'error',
        `${cfg.label} allows at most ${cfg.hardLimit} characters (currently ${text.length}).`,
        { platform: p, hardLimit: cfg.hardLimit, length: text.length },
      );
    } else if (text.length > cfg.softLimit) {
      pushIssue(
        issues,
        ImportIssueCode.NEAR_CHAR_LIMIT,
        'warning',
        `${cfg.label}: approaching or over the recommended ${cfg.softLimit} characters (soft limit).`,
        { platform: p, softLimit: cfg.softLimit, length: text.length },
      );
    }
  }
}
