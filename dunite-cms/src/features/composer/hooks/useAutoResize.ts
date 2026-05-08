'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Auto-resize a textarea to fit its contents. Uses scrollHeight which
 * incorporates content + padding without reflow flicker.
 *
 *   const ref = useRef<HTMLTextAreaElement>(null);
 *   useAutoResize(ref, value);
 */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  minPx = 200,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.max(minPx, el.scrollHeight);
    el.style.height = `${next}px`;
  }, [ref, value, minPx]);
}

/**
 * Insert text at the current selection of a textarea, preserving cursor
 * position and notifying React via the supplied setter. Returns the
 * resulting selection so callers can refocus the cursor where it ends up.
 */
export function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  insertion: string,
  setValue: (next: string) => void,
): { start: number; end: number } | null {
  if (!textarea) return null;
  const { selectionStart, selectionEnd, value } = textarea;
  const before = value.slice(0, selectionStart);
  const after  = value.slice(selectionEnd);
  const next   = `${before}${insertion}${after}`;
  setValue(next);
  // Restore caret placement on the next tick (after React re-renders).
  const cursor = before.length + insertion.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
  return { start: cursor, end: cursor };
}
