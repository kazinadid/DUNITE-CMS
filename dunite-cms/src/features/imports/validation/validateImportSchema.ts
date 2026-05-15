import {
  canonicalFieldFromHeader,
  IMPORT_REQUIRED_FIELDS,
  normalizeSpreadsheetHeaderKey,
  type ImportCanonicalField,
} from '../lib/importFieldSchema';

export interface ImportSchemaValidationResult {
  ok: boolean;
  /** Raw header strings as they appeared in the file (after parser trim). */
  detectedRawHeaders: string[];
  /** Canonical fields found at least once in the header row. */
  matchedCanonicalFields: ImportCanonicalField[];
  /** Required canonical fields with no matching column. */
  missingRequired: ImportCanonicalField[];
}

/**
 * Detect required campaign columns from the sheet header row before any row mapping.
 * Unknown columns are preserved in `detectedRawHeaders` for enterprise error surfaces.
 */
export function validateCampaignImportHeaders(rawHeaders: readonly string[]): ImportSchemaValidationResult {
  const seen = new Set<string>();
  const detectedRawHeaders: string[] = [];
  for (const h of rawHeaders) {
    const s = String(h ?? '').trim();
    if (s === '') continue;
    const nk = normalizeSpreadsheetHeaderKey(s);
    if (nk === '') continue;
    if (seen.has(nk)) continue;
    seen.add(nk);
    detectedRawHeaders.push(s);
  }

  const matched = new Set<ImportCanonicalField>();
  for (const h of detectedRawHeaders) {
    const c = canonicalFieldFromHeader(h);
    if (c) matched.add(c);
  }

  const missingRequired = IMPORT_REQUIRED_FIELDS.filter((f) => !matched.has(f));

  return {
    ok: missingRequired.length === 0,
    detectedRawHeaders,
    matchedCanonicalFields: [...matched],
    missingRequired,
  };
}
