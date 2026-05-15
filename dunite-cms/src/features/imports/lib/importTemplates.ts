import { IMPORT_EXPECTED_FIELDS_ORDERED } from './importFieldSchema';

const UTF8_BOM = '\ufeff';

/**
 * Single-row CSV used for client-side template downloads. Header row lists canonical keys.
 */
export function getCampaignImportTemplateCsvSerialized(): string {
  const headers = IMPORT_EXPECTED_FIELDS_ORDERED.join(',');
  return UTF8_BOM + headers + '\r\n'; // BOM helps Excel associate UTF-8
}

/** UTF-8 text/csv Blob for programmatic download hooks or optional API routes. */
export function getCampaignImportTemplateCsvBlob(): Blob {
  return new Blob([getCampaignImportTemplateCsvSerialized()], { type: 'text/csv;charset=utf-8' });
}

/** Build an empty workbook with canonical headers (lazy-loads SheetJS — same dependency as parsers). */
export async function buildCampaignImportTemplateXlsxBlob(): Promise<Blob> {
  const XLSX = await import('xlsx');
  const row = Object.fromEntries(IMPORT_EXPECTED_FIELDS_ORDERED.map((k) => [k, '']));
  const ws = XLSX.utils.json_to_sheet([row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import');
  const raw = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
  const copy = new Uint8Array(raw);
  return new Blob([copy], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Stable filenames served by downloads and future `/api/imports/template/*` routes.
 */
export const IMPORT_TEMPLATE_DOWNLOAD_NAMES = {
  csv: 'dunite-campaign-import-template.csv',
  xlsx: 'dunite-campaign-import-template.xlsx',
} as const;
