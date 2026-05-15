import { extractMappedFields } from './columnMap';
import { getDefaultTimeZone, lookupPublishDateReasonMessage, parsePublishDateUnknown } from './dates';
import { parseHashtags, parseMediaUrls, parsePlatforms } from './splitFields';

import type { NormalizedImportRow } from '../types';

/**
 * Map one raw key-value record into a normalized row shell (no validation issues yet).
 */
export function normalizeRawRecord(
  raw: Record<string, unknown>,
  sourceRowIndex: number,
  tz: string = getDefaultTimeZone(),
): NormalizedImportRow {
  const f = extractMappedFields(raw);

  const { platforms, unknown } = parsePlatforms(f.platformRaw);
  const mediaUrls = parseMediaUrls(f.mediaRaw);
  const hashtags = parseHashtags(f.tagsRaw);
  const trimmedDate = f.dateRaw.trim();
  const parsed = parsePublishDateUnknown(f.dateValue ?? f.dateRaw, tz);
  const { date, warning, reasonCode, normalizedIso } = parsed;

  const diagnostics =
    trimmedDate && (!date || warning)
      ? {
          dateParseDiagnostics: {
            original: trimmedDate,
            normalizedIso: date ? (normalizedIso ?? date.toISOString()) : null,
            reasonCode: date ? undefined : (reasonCode ?? 'unsupported_publish_date_format'),
            reason: date ? undefined : lookupPublishDateReasonMessage(reasonCode),
          },
        }
      : {};

  return {
    sourceRowIndex,
    postText: f.postText,
    platforms,
    publishAt: date,
    ...(trimmedDate ? { publishAtRaw: trimmedDate } : {}),
    mediaUrls,
    hashtags,
    raw,
    parseHints: {
      unknownPlatformTokens: unknown,
      ...(warning ? { dateHeuristicKey: warning } : {}),
      ...(trimmedDate && date === null ? { dateParseFailed: true } : {}),
      ...diagnostics,
    },
    issues: [],
    validationState: 'valid',
  };
}
