'use client';

import { Hash } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';

import { extractHashtags, tokenize } from '../lib/hashtags';
import { useAutoResize } from '../hooks/useAutoResize';

export interface ComposerEditorHandle {
  /** Focus the underlying textarea and place caret at the end. */
  focus:    () => void;
  /** The native textarea, exposed so callers can insertAtCursor. */
  textarea: () => HTMLTextAreaElement | null;
}

interface ComposerEditorProps {
  value:        string;
  onChange:     (next: string) => void;
  placeholder?: string;
  disabled?:    boolean;
  minHeightPx?: number;
}

const EDITOR_CLASSES =
  'px-4 py-3.5 text-[15px] leading-7 font-normal text-gray-900 break-words whitespace-pre-wrap';

/**
 * Main writing surface — auto-resizing textarea with a synced highlight
 * backdrop so hashtags render in brand blue while the caret stays native and
 * keyboard-friendly (Buffer / Typefully style).
 */
export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(
    {
      value,
      onChange,
      placeholder = 'What do you want to share?',
      disabled,
      minHeightPx = 220,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    useAutoResize(textareaRef, value, minHeightPx);

    useImperativeHandle(ref, () => ({
      focus: () => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      },
      textarea: () => textareaRef.current,
    }));

    const tags = extractHashtags(value);

    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors focus-within:border-gray-400 focus-within:ring-2 focus-within:ring-gray-100 disabled:opacity-60">
          {/* Syntax highlight layer (must match textarea metrics exactly). */}
          {value.length > 0 && (
            <div
              className={`pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] ${EDITOR_CLASSES}`}
              aria-hidden
            >
              <div
                className="text-gray-900"
                style={{
                  transform: `translate(-${scrollLeft}px, -${scrollTop}px)`,
                  willChange: 'transform',
                }}
              >
                {tokenize(value).map((t, i) =>
                  t.kind === 'tag' ? (
                    <span
                      key={i}
                      className="rounded-[3px] bg-blue-50/95 px-0.5 font-semibold text-[#0A54A5] ring-1 ring-blue-100/70"
                    >
                      {t.value}
                    </span>
                  ) : (
                    <span key={i}>{t.value}</span>
                  ),
                )}
              </div>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck
            aria-label="Post content"
            onScroll={(e) => {
              setScrollTop(e.currentTarget.scrollTop);
              setScrollLeft(e.currentTarget.scrollLeft);
            }}
            style={{
              minHeight: minHeightPx,
              scrollbarGutter: 'stable',
              WebkitTextFillColor: value.length > 0 ? 'transparent' : undefined,
            }}
            className={[
              'relative z-[1] block w-full resize-none rounded-xl border border-transparent bg-transparent',
              EDITOR_CLASSES,
              'caret-gray-900 selection:bg-[#7A0000]/15',
              'outline-none disabled:pointer-events-none disabled:opacity-60',
              value.length > 0
                ? 'text-transparent [color:transparent]'
                : 'text-gray-900 placeholder:text-gray-400',
            ].join(' ')}
          />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <Hash size={11} aria-hidden /> {tags.length} hashtag{tags.length === 1 ? '' : 's'}
            </span>
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md bg-[#7A0000]/6 px-2 py-0.5 text-xs font-medium text-[#5A0000] ring-1 ring-inset ring-[#7A0000]/12"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  },
);
