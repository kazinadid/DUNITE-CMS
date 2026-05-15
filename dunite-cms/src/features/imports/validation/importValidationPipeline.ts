import { fingerprintContent, fingerprintMediaUrls, fingerprintScheduleAndContent } from '../lib/fingerprints';
import { sanitizeRowPublishAtField } from '../lib/dates';

import { deriveRowValidationState } from './deriveRowState';
import { hydrateParseIssues } from './hydrateParseIssues';
import { applyCrossRowDuplicateRules } from './rules/ruleCrossDuplicates';
import { applyHashtagRules } from './rules/ruleHashtags';
import { applyLongCaptionRule } from './rules/ruleLongCaption';
import { applyMediaRules } from './rules/ruleMedia';
import { applyPlatformLimitRules } from './rules/rulePlatforms';
import { applyRequiredRules } from './rules/ruleRequired';
import { applyScheduleRules } from './rules/ruleSchedule';
import { createImportValidationContext, type ImportValidationContext } from './validationContext';
import { isRowSkippedEmpty } from './rowGuards';

import type { NormalizedImportRow } from '../types';

export interface RunImportValidationOptions {
  timezone: string;
}

function stampFingerprints(rows: NormalizedImportRow[]): void {
  for (const row of rows) {
    const content = fingerprintContent(row.postText);
    const mediaSet = fingerprintMediaUrls(row.mediaUrls);
    const scheduleContent = fingerprintScheduleAndContent(row.publishAt, content);
    row.fingerprints = { content, mediaSet, scheduleContent };
  }
}

/**
 * Full client-side staging validation. Idempotent. Does not touch Supabase posts/media.
 */
export function runImportValidationPipeline(
  rows: NormalizedImportRow[],
  opts: RunImportValidationOptions,
): void {
  const ctx: ImportValidationContext = createImportValidationContext(opts.timezone);

  for (const row of rows) {
    row.issues = [];
    sanitizeRowPublishAtField(row, opts.timezone);
    hydrateParseIssues(row);
  }

  for (const row of rows) {
    applyRequiredRules(row);
  }

  for (const row of rows) {
    if (isRowSkippedEmpty(row)) {
      row.validationState = deriveRowValidationState(row.issues);
      continue;
    }
    applyPlatformLimitRules(row);
    applyLongCaptionRule(row);
    applyMediaRules(row);
    applyScheduleRules(row, ctx);
    applyHashtagRules(row, ctx);
  }

  applyCrossRowDuplicateRules(rows, ctx);

  stampFingerprints(rows);

  for (const row of rows) {
    row.validationState = deriveRowValidationState(row.issues);
  }
}

export { deriveRowValidationState } from './deriveRowState';
