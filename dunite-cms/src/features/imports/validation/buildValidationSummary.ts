import type { ImportValidationSummary, NormalizedImportRow } from '../types';

/**
 * Aggregated metrics + grouped code totals for sticky dashboards / API parity.
 */
export function buildImportValidationSummary(rows: readonly NormalizedImportRow[]): ImportValidationSummary {
  const errorsByCode: Record<string, number> = {};
  const warningsByCode: Record<string, number> = {};

  let validRows = 0;
  let warningRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    for (const issue of row.issues) {
      const bucket = issue.severity === 'error' ? errorsByCode : warningsByCode;
      bucket[issue.code] = (bucket[issue.code] ?? 0) + 1;
    }

    switch (row.validationState) {
      case 'valid':
        validRows++;
        break;
      case 'warning':
        warningRows++;
        break;
      case 'invalid':
        invalidRows++;
        break;
      case 'duplicate':
        duplicateRows++;
        break;
      case 'skipped':
        skippedRows++;
        break;
      default:
        break;
    }
  }

  const totalRows = rows.length;
  const stagingReadyRows = validRows + warningRows + duplicateRows;

  const nonSkipped = totalRows - skippedRows;
  const readinessPct =
    nonSkipped === 0 ? 0 : Math.round((stagingReadyRows / nonSkipped) * 100);

  return {
    totalRows,
    validRows,
    warningRows,
    invalidRows,
    duplicateRows,
    skippedRows,
    stagingReadyRows,
    readinessPct,
    errorsByCode,
    warningsByCode,
  };
}

/** Top N codes for compact UI lists */
export function topIssueCodes(
  map: Record<string, number>,
  n: number,
): { code: string; count: number }[] {
  return Object.entries(map)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
