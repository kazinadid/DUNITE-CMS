import { extractMappedFields } from './columnMap';
import { parsePublishDate, getDefaultTimeZone } from './dates';
import { parseHashtags, parseMediaUrls, parsePlatforms } from './splitFields';

import type { NormalizedImportRow } from '../types';

/**
 * Map one raw key-value record (strings) into a normalized row shell.
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

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const u of unknown) {
    warnings.push(`Unknown platform token "${u}" — ignored.`);
  }
  if (warning) {
    warnings.push(`Date parsing used a fallback heuristic (${warning}).`);
  }

  if (f.dateRaw.trim() && date === null) {
    errors.push('Could not parse publish date.');
  }

  return {
    sourceRowIndex,
    postText: f.postText,
    platforms,
    publishAt: date,
    ...(f.dateRaw.trim() ? { publishAtRaw: f.dateRaw.trim() } : {}),
    mediaUrls,
    hashtags,
    raw,
    errors,
    warnings,
  };
}
