import Papa from 'papaparse';

export interface CsvParseOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Stream rows through Papa's `step` callback to bound memory growth and report progress.
 */
export async function parseCsvToRecords(
  file: File,
  opts: CsvParseOptions = {},
): Promise<{ rows: Record<string, string>[] }> {
  const { onProgress, signal } = opts;

  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    let aborted = false;

    const checkAbort = () => {
      if (signal?.aborted) {
        aborted = true;
        return true;
      }
      return false;
    };

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      encoding: 'UTF-8',
      transformHeader: (h) => h.trim(),
      step: (results, parser) => {
        if (checkAbort()) {
          parser.abort();
          return;
        }
        const data = results.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const rec = data as Record<string, string>;
          const hasCell = Object.values(rec).some((v) => String(v ?? '').trim() !== '');
          if (hasCell) rows.push(rec);
        }
        if (rows.length % 400 === 0 && onProgress) {
          onProgress(Math.min(0.45, rows.length / 20000));
        }
      },
      complete: () => {
        if (aborted || checkAbort()) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        onProgress?.(0.5);
        resolve({ rows });
      },
      error: (err) => reject(err),
    });
  });
}
