import { stringifySpreadsheetCell } from '../lib/spreadsheetCell';
import type { ParsedSheetRecords } from './parsedSheetRecords';

export type { ParsedSheetRecords };

export interface XlsxParseOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Reads the first worksheet and converts rows to plain objects using the header row.
 * SheetJS is loaded dynamically so CSV-only sessions stay lighter.
 */

export async function parseXlsxToRecords(
  file: File,
  opts: XlsxParseOptions = {},
): Promise<ParsedSheetRecords> {
  const { onProgress, signal } = opts;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  onProgress?.(0.05);

  const XLSX = await import('xlsx');

  const buf = await file.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  onProgress?.(0.15);

  const wb = XLSX.read(buf, {
    type: 'array',
    cellDates: true,
  });

  onProgress?.(0.35);

  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], rawHeaders: [] };
  }

  const ws = wb.Sheets[sheetName];
  const asRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  }) as unknown[][];
  const headerRowArr = Array.isArray(asRows[0]) ? (asRows[0] as unknown[]) : [];
  const headerCells = headerRowArr.map((cell) => stringifySpreadsheetCell(cell));
  const rawHeaders = headerCells.map((cell) => cell.trim()).filter((s) => s !== '');

  onProgress?.(0.5);

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < asRows.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const row = Array.isArray(asRows[i]) ? (asRows[i] as unknown[]) : [];
    const rec: Record<string, unknown> = {};

    for (let c = 0; c < headerCells.length; c++) {
      const key = headerCells[c]?.trim() ?? '';
      if (!key) continue;
      rec[key] = row[c] ?? null;
    }

    const hasCell = Object.values(rec).some((v) => stringifySpreadsheetCell(v).trim() !== '');
    if (hasCell) rows.push(rec);
    if (i % 500 === 0) {
      onProgress?.(0.35 + 0.15 * (i / Math.max(asRows.length - 1, 1)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(0.5);
  return { rows, rawHeaders };
}
