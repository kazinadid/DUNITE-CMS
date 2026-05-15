/**
 * Shared context for cross-row rules (hashtag reuse, etc.).
 */
export interface ImportValidationContext {
  now: Date;
  timezone: string;
  /** hashtag lower -> first source row index */
  hashtagFirstRow: Map<string, number>;
  /** normalized media url -> first source row index */
  mediaUrlFirstRow: Map<string, number>;
}

export function createImportValidationContext(timezone: string): ImportValidationContext {
  return {
    now: new Date(),
    timezone,
    hashtagFirstRow: new Map(),
    mediaUrlFirstRow: new Map(),
  };
}
