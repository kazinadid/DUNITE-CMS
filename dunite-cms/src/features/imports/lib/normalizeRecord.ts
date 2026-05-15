import { extractMappedFields } from './columnMap';
import { parsePublishDate, getDefaultTimeZone } from './dates';
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
  const { date, warning } = parsePublishDate(f.dateRaw, tz);

  return {
    sourceRowIndex,
    postText: f.postText,
    platforms,
    publishAt: date,
    ...(f.dateRaw.trim() ? { publishAtRaw: f.dateRaw.trim() } : {}),
    mediaUrls,
    hashtags,
    raw,
    parseHints: {
      unknownPlatformTokens: unknown,
      ...(warning ? { dateHeuristicKey: warning } : {}),
      ...(f.dateRaw.trim() && date === null ? { dateParseFailed: true } : {}),
    },
    issues: [],
    validationState: 'valid',
  };
}
