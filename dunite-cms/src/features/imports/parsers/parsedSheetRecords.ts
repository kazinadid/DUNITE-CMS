/**
 * Common shape returned by spreadsheet parsers (CSV + XLSX) for batch import.
 */
export interface ParsedSheetRecords {
  rows: Record<string, unknown>[];
  /** Header labels from the first row (trimmed); used for schema validation. */
  rawHeaders: string[];
}
