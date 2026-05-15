/**
 * Stable string form for spreadsheet cells before column mapping.
 * Dates → ISO-8601 UTC (avoids locale-dependent `String(date)` from breaking parsers).
 */
export function stringifySpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}
