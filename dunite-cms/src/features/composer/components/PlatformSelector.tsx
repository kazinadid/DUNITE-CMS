'use client';

import { Check } from 'lucide-react';

import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_LIST } from '../lib/platforms';
import type { PlatformId } from '../types';

interface PlatformSelectorProps {
  value:    PlatformId[];
  onChange: (next: PlatformId[]) => void;
  disabled?: boolean;
}

/**
 * Multi-select platform cards. Buffer-style: each card shows the brand
 * glyph, label and a check when selected. Tappable on mobile, keyboard
 * accessible (proper buttons).
 */
export function PlatformSelector({
  value,
  onChange,
  disabled,
}: PlatformSelectorProps) {
  const toggle = (id: PlatformId) => {
    if (disabled) return;
    onChange(
      value.includes(id) ? value.filter((p) => p !== id) : [...value, id],
    );
  };

  return (
    <div
      role="group"
      aria-label="Target platforms"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {PLATFORM_LIST.map((p) => {
        const active = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(p.id)}
            className={[
              'group relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
              'disabled:cursor-not-allowed disabled:opacity-60',
              active
                ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
      <div
        className="inline-flex flex-1 items-center gap-2 truncate text-left"
      >
        <span
          aria-hidden
          className={[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            active ? 'bg-white/15 text-white' : 'bg-gray-50 text-gray-700',
          ].join(' ')}
          style={!active ? { color: p.brandColor } : undefined}
        >
          <PlatformIcon platform={p.id} size={15} />
        </span>
        <span className="truncate text-left">
          <span className="hidden sm:inline">{p.label}</span>
          <span className="sm:hidden">{p.shortLabel}</span>
        </span>
      </div>
            <span
              aria-hidden
              className={[
                'ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition',
                active ? 'bg-white text-gray-900' : 'border border-gray-200 text-transparent',
              ].join(' ')}
            >
              <Check size={10} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
