'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { getDefaultTimeZone } from '../lib/dates';
import { normalizeRawRecord } from '../lib/normalizeRecord';
import { parseCsvToRecords } from '../parsers/parseCsv';
import { parseXlsxToRecords } from '../parsers/parseXlsx';
import { forEachYieldChunk } from '../lib/chunkedForEach';
import { summarizeRows, validateNormalizedRow } from '../validation/validateRows';

import type {
  ImportParseSummary,
  ImportWorkflowPhase,
  ImportWorkflowState,
  NormalizedImportRow,
} from '../types';

const MAX_ROWS = 100_000;
const VALIDATION_CHUNK = 250;
const PROGRESS_DEBOUNCE_MS = 120;

function inferKind(file: File): 'csv' | 'xlsx' {
  const n = file.name.toLowerCase();
  if (n.endsWith('.csv')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
  const mime = file.type.toLowerCase();
  if (mime.includes('csv') || mime === 'text/plain') return 'csv';
  return 'xlsx';
}

export function useBatchImportWorkflow() {
  const [state, setState] = useState<ImportWorkflowState>({
    phase: 'idle',
    progress: 0,
    displayProgress: 0,
    fileName: null,
    fileKind: null,
    rows: [],
    summary: null,
    fatalMessage: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tz = useMemo(() => getDefaultTimeZone(), []);

  const setDisplayDebounced = useCallback((pct: number) => {
    if (progressTimer.current) clearTimeout(progressTimer.current);
    progressTimer.current = setTimeout(() => {
      setState((s) => ({ ...s, displayProgress: pct }));
    }, PROGRESS_DEBOUNCE_MS);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => ({
      ...s,
      phase: 'cancelled',
      progress: 0,
      displayProgress: 0,
      fatalMessage: null,
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      phase: 'idle',
      progress: 0,
      displayProgress: 0,
      fileName: null,
      fileKind: null,
      rows: [],
      summary: null,
      fatalMessage: null,
    });
  }, []);

  const runParse = useCallback(
    async (file: File) => {
      const kind = inferKind(file);
      const ac = new AbortController();
      abortRef.current = ac;
      const t0 = performance.now();

      setState({
        phase: 'reading',
        progress: 0.02,
        displayProgress: 0,
        fileName: file.name,
        fileKind: kind,
        rows: [],
        summary: null,
        fatalMessage: null,
      });
      setDisplayDebounced(2);

      try {
        if (file.size > 40 * 1024 * 1024) {
          throw new Error('File exceeds the 40 MB safety limit. Split into smaller uploads.');
        }

        setState((s) => ({ ...s, phase: 'parsing', progress: 0.08 }));
        setDisplayDebounced(8);

        const onProgress = (frac: number) => {
          const p = 0.08 + frac * 0.42;
          setState((s) => ({ ...s, progress: p }));
          setDisplayDebounced(Math.round(p * 100));
        };

        const parsed =
          kind === 'csv'
            ? await parseCsvToRecords(file, { signal: ac.signal, onProgress })
            : await parseXlsxToRecords(file, { signal: ac.signal, onProgress });

        if (parsed.rows.length > MAX_ROWS) {
          throw new Error(
            `This file has ${parsed.rows.length.toLocaleString()} rows. Maximum supported in-browser is ${MAX_ROWS.toLocaleString()}.`,
          );
        }

        setState((s) => ({ ...s, phase: 'normalizing', progress: 0.55 }));
        setDisplayDebounced(55);

        const normalized: NormalizedImportRow[] = parsed.rows.map((r, i) =>
          normalizeRawRecord(r as Record<string, unknown>, i + 2, tz),
        );

        setState((s) => ({ ...s, phase: 'validating', progress: 0.62 }));
        setDisplayDebounced(62);

        await forEachYieldChunk(
          normalized,
          VALIDATION_CHUNK,
          async (chunk) => {
            if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');
            for (const row of chunk) {
              validateNormalizedRow(row);
            }
          },
          ac.signal,
        );

        setState((s) => ({
          ...s,
          progress: 0.98,
          rows: normalized,
        }));
        setDisplayDebounced(98);

        const meta = summarizeRows(normalized);
        const summary: ImportParseSummary = {
          fileName: file.name,
          fileType: kind,
          totalRows: meta.totalRows,
          validRows: meta.validRows,
          rowsWithErrors: meta.rowsWithErrors,
          rowsWithWarnings: meta.rowsWithWarnings,
          parseFatalError: null,
          durationMs: Math.round(performance.now() - t0),
        };

        setState((s) => ({
          ...s,
          phase: 'ready',
          progress: 1,
          displayProgress: 100,
          summary,
          fatalMessage: null,
        }));
      } catch (e) {
        const msg =
          e instanceof DOMException && e.name === 'AbortError'
            ? 'Import cancelled.'
            : e instanceof Error
              ? e.message
              : 'Import failed.';
        setState((s) => ({
          ...s,
          phase: e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'error',
          progress: 0,
          displayProgress: 0,
          rows: [],
          summary: null,
          fatalMessage: msg,
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [setDisplayDebounced, tz],
  );

  return {
    state,
    runParse,
    cancel,
    reset,
  };
}
