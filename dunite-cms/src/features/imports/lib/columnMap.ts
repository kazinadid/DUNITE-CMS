/**
 * Map raw row keys to campaign fields. Synonyms come from {@link importFieldSchema}.
 * Primary match: strict normalized alias; secondary: light fuzzy match for legacy sheets.
 */

import { IMPORT_FIELD_ALIASES, normalizeSpreadsheetHeaderKey } from './importFieldSchema';

const POST_TEXT_ALIASES = IMPORT_FIELD_ALIASES.post_text;
const PLATFORM_ALIASES = IMPORT_FIELD_ALIASES.platform;
const DATE_ALIASES = IMPORT_FIELD_ALIASES.publish_date;
const MEDIA_ALIASES = IMPORT_FIELD_ALIASES.media_url;
const TAG_ALIASES = IMPORT_FIELD_ALIASES.hashtags;

function normKey(k: string): string {
  return normalizeSpreadsheetHeaderKey(k);
}

function pickColumn(
  raw: Record<string, unknown>,
  aliases: readonly string[],
): { key: string | null; value: unknown } {
  const entries = Object.entries(raw);
  const aliasSet = new Set(aliases.map((a) => normKey(a)));

  for (const [key, value] of entries) {
    if (aliasSet.has(normKey(key))) return { key, value };
  }

  const fuzzy = entries.find(([key]) =>
    aliases.some((a) => normKey(key).includes(normKey(a)) || normKey(a).includes(normKey(key))),
  );
  return fuzzy ? { key: fuzzy[0], value: fuzzy[1] } : { key: null, value: undefined };
}

export function extractMappedFields(raw: Record<string, unknown>): {
  postText: string;
  platformRaw: string;
  dateRaw: string;
  mediaRaw: string;
  tagsRaw: string;
} {
  const pt = pickColumn(raw, POST_TEXT_ALIASES);
  const pl = pickColumn(raw, PLATFORM_ALIASES);
  const dt = pickColumn(raw, DATE_ALIASES);
  const md = pickColumn(raw, MEDIA_ALIASES);
  const tg = pickColumn(raw, TAG_ALIASES);

  const asStr = (v: unknown) =>
    v === null || v === undefined ? '' : String(v).trim();

  return {
    postText: asStr(pt.value),
    platformRaw: asStr(pl.value),
    dateRaw: asStr(dt.value),
    mediaRaw: asStr(md.value),
    tagsRaw: asStr(tg.value),
  };
}
