/**
 * Common shape returned by spreadsheet parsers (CSV + XLSX) for batch import.
 */
export interface ParsedSheetRecords {
  rows: Record<string, string>[];
  /** Header labels from the first row (trimmed); used for schema validation. */
  rawHeaders: string[];
}
