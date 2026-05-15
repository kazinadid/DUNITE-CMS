/**
 * Stable codes for grouping, analytics, and i18n. Used by summary rollups and UX badges.
 */
export const ImportIssueCode = {
  // File-level (reserved for server/analytics parity with client schema gate)
  IMPORT_SCHEMA_MISSING_REQUIRED: 'import_schema_missing_required',

  // Errors (blocking)
  EMPTY_IMPORT_ROW: 'empty_import_row',
  WHITESPACE_ONLY: 'whitespace_only_content',
  MISSING_CONTENT: 'missing_content',
  MISSING_PLATFORMS: 'missing_platforms',
  INVALID_PLATFORM_TOKEN: 'invalid_platform',
  INVALID_DATE: 'invalid_date',
  INVALID_TIMEZONE_HINT: 'invalid_timezone',
  MALFORMED_URL: 'malformed_url',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  INVALID_MEDIA_EXTENSION: 'invalid_media_extension',
  MEDIA_URL_NOT_HTTPS: 'media_url_not_https',
  MALFORMED_HASHTAG: 'malformed_hashtag',

  // Cross-row / duplicate (usually warning-level unless policy chooses otherwise)
  DUPLICATE_CONTENT: 'duplicate_content',
  DUPLICATE_MEDIA_URL: 'duplicate_media_url',
  DUPLICATE_SCHEDULE: 'duplicate_schedule',

  // Warnings (non-blocking)
  UNKNOWN_PLATFORM_TOKEN: 'unknown_platform_token', // parse-time dropped token
  DATE_PARSE_HEURISTIC: 'date_parse_heuristic',
  NEAR_CHAR_LIMIT: 'near_character_limit',
  OVER_SOFT_CHAR_LIMIT: 'over_soft_character_limit',
  CONTENT_EXCEEDS_PLATFORM_HARD: 'content_exceeds_platform_hard',
  LONG_CAPTION: 'very_long_caption',
  MEDIA_REQUIRED_SOFT: 'media_required_for_platform',
  TOO_MANY_MEDIA: 'too_many_media_for_platform',
  SCHEDULE_VERY_SOON: 'schedule_very_close',
  REPEATED_HASHTAG: 'repeated_hashtag_across_file',
  REUSED_MEDIA_ACROSS_ROWS: 'reused_media_across_rows',
} as const;

export type ImportIssueCode = (typeof ImportIssueCode)[keyof typeof ImportIssueCode];
