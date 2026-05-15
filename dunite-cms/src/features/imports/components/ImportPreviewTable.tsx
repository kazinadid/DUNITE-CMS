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
import { Table2 } from 'lucide-react';

import { PLATFORMS } from '@/features/composer/lib/platforms';
import { cn } from '@/lib/utils';

import type { NormalizedImportRow } from '../types';

const ROW_HEIGHT = 44;
const OVERSCAN = 10;
const VIEWPORT_FALLBACK_PX = 360;

const STATE_STYLES: Record<
  NormalizedImportRow['validationState'],
  { label: string; className: string }
> = {
  valid: { label: 'Valid', className: 'bg-emerald-500/15 text-emerald-900' },
  warning: { label: 'Warning', className: 'bg-amber-500/15 text-amber-950' },
  duplicate: { label: 'Duplicate', className: 'bg-violet-500/15 text-violet-950' },
  invalid: { label: 'Invalid', className: 'bg-destructive/15 text-destructive' },
  skipped: { label: 'Skipped', className: 'bg-muted text-muted-foreground' },
};

interface ImportPreviewTableProps {
  rows: NormalizedImportRow[];
  selectedSourceIndex: number | null;
  onSelectSourceIndex: (index: number | null) => void;
  className?: string;
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

/** Virtualized preview — mounts only when there is at least one row so hooks stay off the empty path. */
function ImportPreviewTableVirtualized({
  rows,
  selectedSourceIndex,
  onSelectSourceIndex,
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
        Virtualized window: rows {start + 1}–{Math.min(end, rows.length)} of {rows.length}. Keyboard: focus a row and
        press Enter to inspect details.
      </p>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[min(420px,50vh)] min-h-0 flex-1 overflow-auto rounded-lg border ring-1 ring-foreground/10"
      >
        <table
          role="grid"
          aria-rowcount={rows.length}
          aria-colcount={6}
          className="w-full min-w-[760px] border-collapse text-left text-xs"
        >
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b">
              <th scope="col" className="px-2 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Issues
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Platforms
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Publish
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Preview
              </th>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr style={{ height: topPad }} aria-hidden>
                <td colSpan={6} />
              </tr>
            )}
            {slice.map((r) => {
              const plat = r.platforms.map((p) => PLATFORMS[p]?.shortLabel ?? p).join(', ');
              const prev = r.postText.slice(0, 120) + (r.postText.length > 120 ? '…' : '');
              const when = r.publishAt
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(r.publishAt)
                : '—';
              const sel = selectedSourceIndex === r.sourceRowIndex;
              const badge = STATE_STYLES[r.validationState];
              const errCount = r.issues.filter((i) => i.severity === 'error').length;
              const warnCount = r.issues.filter((i) => i.severity === 'warning').length;

              return (
                <tr
                  key={r.sourceRowIndex}
                  role="row"
                  tabIndex={0}
                  aria-selected={sel}
                  aria-label={`Row ${r.sourceRowIndex}, ${r.validationState}, ${r.issues.length} issues`}
                  className={cn(
                    'cursor-pointer border-b border-foreground/5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
                    sel && 'bg-primary/5',
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onSelectSourceIndex(r.sourceRowIndex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectSourceIndex(r.sourceRowIndex);
                    }
                  }}
                >
                  <td className="px-2 py-1.5 align-middle text-muted-foreground">{r.sourceRowIndex}</td>
                  <td className="px-2 py-1.5 align-middle">
                    <span
                      className={cn(
                        'inline-flex max-w-[100px] rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 align-middle tabular-nums text-muted-foreground">
                    {errCount > 0 && <span className="text-destructive">{errCount}E</span>}
                    {errCount > 0 && warnCount > 0 && ' '}
                    {warnCount > 0 && <span className="text-amber-800">{warnCount}W</span>}
                    {errCount === 0 && warnCount === 0 && '—'}
                  </td>
                  <td className="max-w-[120px] truncate px-2 py-1.5 align-middle">{plat || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 align-middle">{when}</td>
                  <td className="max-w-[280px] px-2 py-1.5 align-middle">
                    <div className="truncate" title={r.postText}>
                      {prev || '—'}
                    </div>
                  </td>
                </tr>
              );
            })}
            {bottomPad > 0 && (
              <tr style={{ height: bottomPad }} aria-hidden>
                <td colSpan={6} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Campaign import preview: compact empty state (no scroll / no virtualization) or virtualized table when data exists.
 */
export function ImportPreviewTable(props: ImportPreviewTableProps) {
  if (props.rows.length === 0) {
    return <ImportPreviewTableEmpty className={props.className} />;
  }
  return <ImportPreviewTableVirtualized {...props} />;
}
