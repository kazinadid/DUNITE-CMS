'use client';

import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';

import { PLATFORMS } from '@/features/composer/lib/platforms';
import { cn } from '@/lib/utils';

import type { NormalizedImportRow } from '../types';

const ROW_HEIGHT = 48;
const OVERSCAN = 12;

interface ImportPreviewTableProps {
  rows: NormalizedImportRow[];
  className?: string;
}

export function ImportPreviewTable({ rows, className }: ImportPreviewTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [, relayout] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    relayout();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { totalHeight, start, end, slice } = useMemo(() => {
    const n = rows.length;
    const h = Math.max(n * ROW_HEIGHT, 0);
    const vp =
      scrollRef.current?.clientHeight ??
      (typeof window !== 'undefined' ? Math.min(400, window.innerHeight * 0.45) : 400);
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const vis = Math.ceil(vp / ROW_HEIGHT) + OVERSCAN * 2;
    const endIdx = Math.min(n, startIdx + vis);
    return {
      totalHeight: h,
      start: startIdx,
      end: endIdx,
      slice: rows.slice(startIdx, endIdx),
    };
  }, [rows, scrollTop]);

  const topPad = start * ROW_HEIGHT;
  const bottomPad = Math.max(0, totalHeight - end * ROW_HEIGHT);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          'flex min-h-[200px] items-center justify-center rounded-lg border border-dashed bg-muted/20 text-sm text-muted-foreground',
          className,
        )}
      >
        No rows to preview yet.
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <p className="text-xs text-muted-foreground">
        Virtualized preview (rows {start + 1}–{Math.min(end, rows.length)} of {rows.length}).
        Full dataset retained in memory for the next pipeline step (server upload / commit).
      </p>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[min(420px,50vh)] min-h-0 overflow-auto rounded-lg border ring-1 ring-foreground/10"
      >
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Platforms</th>
              <th className="px-2 py-2 font-medium">Publish</th>
              <th className="px-2 py-2 font-medium">Preview</th>
            </tr>
          </thead>
          <tbody>
            {topPad > 0 && (
              <tr style={{ height: topPad }} aria-hidden>
                <td colSpan={5} />
              </tr>
            )}
            {slice.map((r) => {
              const plat = r.platforms.map((p) => PLATFORMS[p]?.shortLabel ?? p).join(', ');
              const ok = r.errors.length === 0;
              const prev = r.postText.slice(0, 140) + (r.postText.length > 140 ? '…' : '');
              const when = r.publishAt
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(r.publishAt)
                : '—';

              return (
                <tr
                  key={r.sourceRowIndex}
                  className="border-b border-foreground/5 odd:bg-muted/20"
                  style={{ height: ROW_HEIGHT }}
                >
                  <td className="align-top px-2 py-1.5 text-muted-foreground">{r.sourceRowIndex}</td>
                  <td className="align-top px-2 py-1.5">
                    <span
                      className={cn(
                        'inline-flex rounded px-1.5 py-0.5 font-medium',
                        ok ? 'bg-emerald-500/15 text-emerald-800' : 'bg-destructive/15 text-destructive',
                      )}
                    >
                      {ok ? 'OK' : 'Issues'}
                    </span>
                  </td>
                  <td className="align-top px-2 py-1.5">{plat || '—'}</td>
                  <td className="align-top px-2 py-1.5 whitespace-nowrap">{when}</td>
                  <td className="align-top px-2 py-1.5">
                    <div className="max-w-[320px] truncate" title={r.postText}>
                      {prev || '—'}
                    </div>
                    {(r.errors.length > 0 || r.warnings.length > 0) && (
                      <ul className="mt-1 list-inside list-disc text-[10px] text-destructive">
                        {r.errors.slice(0, 2).map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                        {r.warnings.slice(0, 1).map((w) => (
                          <li key={w} className="text-amber-700">
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
            {bottomPad > 0 && (
              <tr style={{ height: bottomPad }} aria-hidden>
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
