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
): Promise<{ rows: Record<string, string>[] }> {
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
    return { rows: [] };
  }

  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });

  onProgress?.(0.5);

  const rows: Record<string, string>[] = [];
  for (let i = 0; i < json.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const row = json[i];
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      rec[String(k).trim()] = v === null || v === undefined ? '' : String(v);
    }
    const hasCell = Object.values(rec).some((v) => v.trim() !== '');
    if (hasCell) rows.push(rec);
    if (i % 500 === 0) {
      onProgress?.(0.35 + 0.15 * (i / Math.max(json.length, 1)));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(0.5);
  return { rows };
}
