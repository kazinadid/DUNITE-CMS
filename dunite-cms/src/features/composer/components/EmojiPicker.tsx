'use client';

import { Smile, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { EMOJI_CATEGORIES } from '../lib/emojis';

interface EmojiPickerProps {
  onSelect:   (emoji: string) => void;
  disabled?:  boolean;
  /** Optional CSS class for the trigger button. */
  className?: string;
}

/**
 * Compact, dependency-free emoji picker. Curated catalog grouped by
 * category. Inserts the selected emoji via `onSelect` so callers can
 * place it at the textarea's caret.
 */
export function EmojiPicker({ onSelect, disabled, className = '' }: EmojiPickerProps) {
  const [open,     setOpen]     = useState(false);
  const [active,   setActive]   = useState(EMOJI_CATEGORIES[0]!.id);
  const containerRef            = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cat = EMOJI_CATEGORIES.find((c) => c.id === active) ?? EMOJI_CATEGORIES[0]!;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Insert emoji"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Smile size={15} aria-hidden />
        <span className="hidden sm:inline">Emoji</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className={
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[min(340px,52vh)] animate-in slide-in-from-bottom-2 flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-xl ' +
            'sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:max-h-[min(320px,60vh)] sm:w-[min(320px,calc(100vw-2rem))] sm:animate-in sm:fade-in-0 sm:zoom-in-95 sm:rounded-xl sm:slide-in-from-bottom-0'
          }
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pick an emoji</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close emoji picker"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={12} aria-hidden />
            </button>
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-1.5 scrollbar-none">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  active === c.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="max-h-60 overflow-y-auto p-2">
            <div className="grid grid-cols-8 gap-1">
              {cat.emojis.map((e, i) => (
                <button
                  key={`${cat.id}-${i}-${e}`}
                  type="button"
                  onClick={() => {
                    onSelect(e);
                    // Stay open — quick-fire common case.
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition hover:bg-gray-100"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
