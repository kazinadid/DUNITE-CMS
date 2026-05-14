'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface VirtualListWindowResult<T> {
  /** Items to render for the current scroll window */
  slice: T[];
  /** Total scroll height (px) */
  totalHeight: number;
  /** Top padding (px) before the first rendered row */
  offsetTop: number;
  /** Bottom padding (px) after the last rendered row */
  offsetBottom: number;
  /** Re-attach after ref mounts */
  onContainerRef: (el: HTMLDivElement | null) => void;
}

/**
 * Lightweight list windowing without extra dependencies (chunk-safe for large tables).
 */
export function useVirtualListWindow<T>(
  items: T[],
  rowHeightPx: number,
  options?: { overscan?: number },
): VirtualListWindowResult<T> {
  const overscan = options?.overscan ?? 6;
  const [range, setRange] = useState({ start: 0, end: Math.min(24, items.length) });
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const recalc = useCallback(() => {
    const el = container;
    if (!el || items.length === 0) {
      setRange({ start: 0, end: Math.min(24, items.length) });
      return;
    }
    const top = el.scrollTop;
    const view = el.clientHeight;
    const start = Math.max(0, Math.floor(top / rowHeightPx) - overscan);
    const end = Math.min(items.length, Math.ceil((top + view) / rowHeightPx) + overscan);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [container, items.length, rowHeightPx, overscan]);

  useEffect(() => {
    recalc();
  }, [recalc, items.length]);

  useEffect(() => {
    const el = container;
    if (!el) return;
    const onScroll = () => recalc();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => recalc()) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [container, recalc]);

  const slice = useMemo(() => items.slice(range.start, range.end), [items, range.start, range.end]);
  const totalHeight = items.length * rowHeightPx;
  const offsetTop = range.start * rowHeightPx;
  const offsetBottom = Math.max(0, totalHeight - range.end * rowHeightPx);

  const onContainerRef = useCallback((el: HTMLDivElement | null) => {
    setContainer(el);
  }, []);

  return { slice, totalHeight, offsetTop, offsetBottom, onContainerRef };
}
