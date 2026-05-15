/**
 * Canonical campaign spreadsheet schema (client staging). Used for header validation,
 * normalization, column mapping, and template generation.
 */

export type ImportCanonicalField =
  | 'post_text'
  | 'platform'
  | 'publish_date'
  | 'media_url'
  | 'hashtags';

/** Blocking — import cannot proceed until these columns map from the file headers. */
export const IMPORT_REQUIRED_FIELDS: ImportCanonicalField[] = ['post_text', 'platform'];

/** Shown as optional in onboarding / template tooling. */
export const IMPORT_OPTIONAL_FIELDS: ImportCanonicalField[] = [
  'publish_date',
  'media_url',
  'hashtags',
];

/** Canonical display order for UI and downloadable templates. */
export const IMPORT_EXPECTED_FIELDS_ORDERED: ImportCanonicalField[] = [
  'post_text',
  'platform',
  'publish_date',
  'media_url',
  'hashtags',
];

export const IMPORT_FIELD_LABELS: Record<ImportCanonicalField, string> = {
  post_text: 'Post text',
  platform: 'Platform(s)',
  publish_date: 'Publish date',
  media_url: 'Media URL(s)',
  hashtags: 'Hashtags',
};

/**
 * Normalize a spreadsheet header token for comparisons.
 * Covers case, spaces, underscores, dashes, and common unicode dashes.
 */
export function normalizeSpreadsheetHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/#/g, '')
    .replace(/[\s\-–—]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Canonical header keys matching {@link IMPORT_EXPECTED_FIELDS_ORDERED}
 * for CSV/XLSX template rows.
 */
export const IMPORT_TEMPLATE_HEADER_KEYS = IMPORT_EXPECTED_FIELDS_ORDERED;

export const IMPORT_FIELD_ALIASES: Record<ImportCanonicalField, readonly string[]> = {
  post_text: [
    'post',
    'post_text',
    'post-text',
    'post text',
    'body',
    'content',
    'caption',
    'text',
    'message',
    'copy',
  ],
  platform: ['platform', 'platforms', 'channels', 'network', 'social'],
  publish_date: [
    'publish_date',
    'publish-date',
    'publish date',
    'published_at',
    'scheduled_at',
    'scheduled-at',
    'scheduled at',
    'date',
    'datetime',
    'time',
    'publish_at',
  ],
  media_url: [
    'media_url',
    'media-url',
    'media urls',
    'media',
    'media_urls',
    'image',
    'images',
    'photo',
    'photos',
    'attachment',
    'attachments',
    'url',
    'urls',
  ],
  hashtags: ['hashtags', 'hashtag', 'tags', 'tag'],
};

function buildStrictAliasLookup(): Map<string, ImportCanonicalField> {
  const m = new Map<string, ImportCanonicalField>();
  for (const field of IMPORT_EXPECTED_FIELDS_ORDERED) {
    for (const a of IMPORT_FIELD_ALIASES[field]) {
      m.set(normalizeSpreadsheetHeaderKey(a), field);
    }
  }
  return m;
}

/** Strict synonym map: normalized alias → canonical field (first alias wins if dupes). */
export const IMPORT_STRICT_ALIAS_TO_FIELD = buildStrictAliasLookup();

/**
 * Map a spreadsheet column header string to one canonical field, or null if unknown.
 * Uses strict synonym matching only — no heuristic substring matching.
 */
export function canonicalFieldFromHeader(header: string): ImportCanonicalField | null {
  return IMPORT_STRICT_ALIAS_TO_FIELD.get(normalizeSpreadsheetHeaderKey(header)) ?? null;
}
