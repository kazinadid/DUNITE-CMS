import type { NormalizedImportRow } from '../types';

/**
 * Stable contract for the next backend/API step — enqueue `import_jobs`,
 * persist `import_rows`, or diff against existing posts. The UI can pass this
 * JSON through a server action once wired.
 */
export interface ImportPreviewPayload {
  version: 1;
  generatedAt: string;
  timezone: string;
  rowCount: number;
  rows: NormalizedImportRow[];
}

export function buildImportPreviewPayload(
  rows: NormalizedImportRow[],
  timezone: string,
): ImportPreviewPayload {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    timezone,
    rowCount: rows.length,
    rows,
  };
}
