/**
 * Header normalization: spreadsheets ship many synonyms. Match case-insensitively
 * with light punctuation stripping.
 */

const POST_TEXT_ALIASES = [
  'post',
  'post_text',
  'post text',
  'body',
  'content',
  'caption',
  'text',
  'message',
  'copy',
];

const PLATFORM_ALIASES = ['platform', 'platforms', 'channels', 'network', 'social'];

const DATE_ALIASES = [
  'publish_date',
  'publish date',
  'published_at',
  'scheduled_at',
  'scheduled at',
  'date',
  'datetime',
  'time',
  'publish_at',
];

const MEDIA_ALIASES = [
  'media_url',
  'media',
  'media_urls',
  'media urls',
  'image',
  'images',
  'photo',
  'photos',
  'attachment',
  'attachments',
  'url',
  'urls',
];

const TAG_ALIASES = ['hashtags', 'hashtag', 'tags', 'tag'];

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/[#\s]+/g, '_').replace(/_+/g, '_');
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
