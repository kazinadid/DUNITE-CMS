import { PLATFORMS } from '@/features/composer/lib/platforms';
import type { PlatformId } from '@/features/composer/types';

import type { NormalizedImportRow } from '../types';

/**
 * Row-level validation after structural normalization.
 * Mutates `errors` / `warnings` arrays in place (enterprise ingestion style).
 */
export function validateNormalizedRow(row: NormalizedImportRow): void {
  if (!row.postText.trim()) {
    row.errors.push('Post text is required.');
  } else if (row.postText.length > 80000) {
    row.warnings.push('Post text is extremely long; review before publishing.');
  }

  if (row.platforms.length === 0) {
    row.errors.push('At least one platform is required.');
  }

  for (const p of row.platforms) {
    const cfg = PLATFORMS[p as PlatformId];
    if (!cfg) continue;
    if (row.postText.length > cfg.hardLimit) {
      row.errors.push(
        `Content exceeds ${cfg.label} maximum of ${cfg.hardLimit} characters (${row.postText.length}).`,
      );
    }
    if (cfg.mediaRequired && row.mediaUrls.length === 0) {
      row.warnings.push(`${cfg.label} typically requires at least one media attachment.`);
    }
    if (row.mediaUrls.length > cfg.maxMedia) {
      row.warnings.push(`${cfg.label} accepts at most ${cfg.maxMedia} media item(s); extras may be dropped.`);
    }
  }

}

export function summarizeRows(rows: NormalizedImportRow[]) {
  let valid = 0;
  let withErr = 0;
  let withWarn = 0;
  for (const r of rows) {
    const hasE = r.errors.length > 0;
    const hasW = r.warnings.length > 0;
    if (!hasE) valid++;
    if (hasE) withErr++;
    if (hasW) withWarn++;
  }
  return {
    totalRows: rows.length,
    validRows: valid,
    rowsWithErrors: withErr,
    rowsWithWarnings: withWarn,
  };
}
