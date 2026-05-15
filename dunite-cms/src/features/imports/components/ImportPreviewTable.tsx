'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link2, Table2 } from 'lucide-react';

import { PLATFORMS } from '@/features/composer/lib/platforms';
import { cn } from '@/lib/utils';

import { ImportIssueCode } from '../validation/issueCodes';

import { ValidationStateBadge } from './ValidationStateBadge';

import type { NormalizedImportRow } from '../types';

const ROW_HEIGHT = 48;
const OVERSCAN = 10;
const VIEWPORT_FALLBACK_PX = 360;
const COL_COUNT = 10;

const DUP_CODES = new Set<string>([
  ImportIssueCode.DUPLICATE_CONTENT,
  ImportIssueCode.DUPLICATE_MEDIA_URL,
  ImportIssueCode.DUPLICATE_SCHEDULE,
]);

export interface ImportPreviewTableProps {
  rows: NormalizedImportRow[];
  selectedSourceIndex: number | null;
  onRowActivate: (sourceRowIndex: number) => void;
  bulkSelected: ReadonlySet<number>;
  onToggleBulkSelect: (sourceRowIndex: number) => void;
  readOnly?: boolean;
  className?: string;
}

function duplicateCellLabel(row: NormalizedImportRow): string {
  if (row.validationState === 'duplicate') return 'Duplicate row';
  if (row.issues.some((i) => DUP_CODES.has(i.code))) return 'Dup signal';
  return '—';
}

/** Static empty state — no scroll, no virtualization, no observers. */
function ImportPreviewTableEmpty({ className }: { className?: string }) {
  const titleId = useId();
  const descId = useId();

  return (
    <section
      className={cn(
        'flex w-full flex-none shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 bg-muted/10 px-6 py-10 text-center sm:px-8',
        className,
      )}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground ring-1 ring-foreground/10"
        aria-hidden
      >
        <Table2 className="size-6 opacity-80" strokeWidth={1.5} />
      </div>
      <h2 id={titleId} className="text-sm font-semibold tracking-tight text-foreground">
        No rows to preview
      </h2>
      <p id={descId} className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
        Upload a CSV or Excel file in the upload panel. Parsed rows and validation will appear here.
      </p>
    </section>
  );
}

function ImportPreviewTableVirtualized({
  rows,
  selectedSourceIndex,
  onRowActivate,
  bulkSelected,
  onToggleBulkSelect,
  readOnly,
  className,
}: ImportPreviewTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [, relayout] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const measure = () => {
      const h = el?.clientHeight ?? 0;
      if (h > 0) setViewportHeight(h);
    };
    measure();
    relayout();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      measure();
      relayout();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { totalHeight, start, end, slice } = useMemo(() => {
    const n = rows.length;
    const h = Math.max(n * ROW_HEIGHT, 0);
    const vp = viewportHeight > 0 ? viewportHeight : VIEWPORT_FALLBACK_PX;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const vis = Math.ceil(vp / ROW_HEIGHT) + OVERSCAN * 2;
    const endIdx = Math.min(n, startIdx + vis);
    return {
      totalHeight: h,
      start: startIdx,
      end: endIdx,
      slice: rows.slice(startIdx, endIdx),
    };
  }, [rows, scrollTop, viewportHeight]);

  const topPad = start * ROW_HEIGHT;
  const bottomPad = Math.max(0, totalHeight - end * ROW_HEIGHT);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-2', className)}>
      <p className="text-xs text-muted-foreground">
        Virtualized: rows {start + 1}–{Math.min(end, rows.length)} of {rows.length}. Click a row to inspect; use
        checkboxes for bulk preparation.
      </p>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[min(420px,50vh)] min-h-0 flex-1 overflow-auto rounded-lg border ring-1 ring-foreground/10"
      >
        <div className="overflow-x-auto">
          <table
            role="grid"
            aria-rowcount={rows.length}
            aria-colcount={COL_COUNT}
            className="w-full min-w-[1240px] border-collapse text-left text-xs"
          >
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b">
                <th scope="col" className="w-10 px-1 py-2 text-center font-medium">
                  <span className="sr-only">Select</span>
                </th>
                <th scope="col" className="w-10 px-1 py-2 font-medium">
                  #
                </th>
                <th scope="col" className="min-w-[88px] px-2 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="min-w-[200px] px-2 py-2 font-medium">
                  Post text
                </th>
                <th scope="col" className="min-w-[100px] px-2 py-2 font-medium">
                  Platforms
                </th>
                <th scope="col" className="min-w-[120px] px-2 py-2 font-medium">
                  Publish
                </th>
                <th scope="col" className="min-w-[120px] px-2 py-2 font-medium">
                  Hashtags
                </th>
                <th scope="col" className="min-w-[100px] px-2 py-2 font-medium">
                  Media
                </th>
                <th scope="col" className="min-w-[72px] px-2 py-2 font-medium">
                  Issues
                </th>
                <th scope="col" className="min-w-[88px] px-2 py-2 font-medium">
                  Duplicate
                </th>
              </tr>
            </thead>
            <tbody>
              {topPad > 0 && (
                <tr style={{ height: topPad }} aria-hidden>
                  <td colSpan={COL_COUNT} />
                </tr>
              )}
              {slice.map((r) => {
                const plat = r.platforms.map((p) => PLATFORMS[p]?.shortLabel ?? p).join(', ');
                const postPreview = r.postText.slice(0, 80) + (r.postText.length > 80 ? '…' : '');
                const when = r.publishAt
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(r.publishAt)
                  : r.publishAtRaw
                    ? String(r.publishAtRaw).slice(0, 24)
                    : '—';
                const tags = r.hashtags.slice(0, 4).join(', ') + (r.hashtags.length > 4 ? '…' : '');
                const mediaLabel =
                  r.mediaUrls.length === 0 ? '—' : r.mediaUrls.length === 1 ? '1 link' : `${r.mediaUrls.length} links`;
                const sel = selectedSourceIndex === r.sourceRowIndex;
                const checked = bulkSelected.has(r.sourceRowIndex);
                const errCount = r.issues.filter((i) => i.severity === 'error').length;
                const warnCount = r.issues.filter((i) => i.severity === 'warning').length;
                const dupLabel = duplicateCellLabel(r);

                return (
                  <tr
                    key={r.sourceRowIndex}
                    role="row"
                    tabIndex={0}
                    aria-selected={sel}
                    aria-label={`Row ${r.sourceRowIndex}, ${r.validationState}`}
                    className={cn(
                      'cursor-pointer border-b border-foreground/5 outline-none transition-colors hover:bg-muted/45 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      sel && 'bg-primary/8',
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onRowActivate(r.sourceRowIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowActivate(r.sourceRowIndex);
                      }
                    }}
                  >
                    <td
                      className="px-1 align-middle"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={checked}
                        disabled={readOnly}
                        aria-label={`Select row ${r.sourceRowIndex}`}
                        onChange={() => onToggleBulkSelect(r.sourceRowIndex)}
                      />
                    </td>
                    <td className="px-1 py-1.5 align-middle tabular-nums text-muted-foreground">{r.sourceRowIndex}</td>
                    <td className="px-2 py-1.5 align-middle">
                      <ValidationStateBadge state={r.validationState} />
                    </td>
                    <td className="max-w-[240px] px-2 py-1.5 align-middle">
                      <div className="truncate" title={r.postText}>
                        {postPreview || '—'}
                      </div>
                    </td>
                    <td className="max-w-[120px] truncate px-2 py-1.5 align-middle">{plat || '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle text-[11px]">{when}</td>
                    <td className="max-w-[140px] px-2 py-1.5 align-middle">
                      <div className="truncate text-[11px]" title={r.hashtags.join(' ')}>
                        {tags || '—'}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="size-3 shrink-0 opacity-60" aria-hidden />
                        {mediaLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 align-middle tabular-nums text-[11px] text-muted-foreground">
                      {errCount > 0 && <span className="text-destructive">{errCount}E</span>}
                      {errCount > 0 && warnCount > 0 && ' '}
                      {warnCount > 0 && <span className="text-amber-800">{warnCount}W</span>}
                      {errCount === 0 && warnCount === 0 && '—'}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-[11px] text-muted-foreground">
                      {dupLabel === '—' ? (
                        '—'
                      ) : (
                        <span
                          className={cn(
                            'inline-flex rounded px-1.5 py-0.5 font-medium',
                            r.validationState === 'duplicate'
                              ? 'bg-violet-500/15 text-violet-950'
                              : 'bg-violet-500/10 text-violet-900',
                          )}
                        >
                          {dupLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {bottomPad > 0 && (
                <tr style={{ height: bottomPad }} aria-hidden>
                  <td colSpan={COL_COUNT} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Campaign import preview: compact empty state or virtualized grid with selection prep.
 */
export function ImportPreviewTable(props: ImportPreviewTableProps) {
  if (props.rows.length === 0) {
    return <ImportPreviewTableEmpty className={props.className} />;
  }
  return <ImportPreviewTableVirtualized {...props} />;
}
