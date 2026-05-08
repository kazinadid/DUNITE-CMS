'use client';

import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

export interface PostAction {
  icon:        LucideIcon;
  label:       string;
  onClick:     () => void;
  destructive?: boolean;
}

interface PostActionsMenuProps {
  actions: PostAction[];
}

export function PostActionsMenu({ actions }: PostActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative" data-card-interactive>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Post actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors',
          'hover:bg-gray-100 hover:text-gray-900',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7A0000]/25',
          open && 'bg-gray-100 text-gray-900',
        )}
      >
        <MoreVertical size={16} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-gray-200/95 bg-white/98 p-1',
            'shadow-[0_16px_50px_-24px_rgba(15,23,42,0.45)]',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200',
          )}
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={`${a.label}-${i}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  a.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon size={14} className="shrink-0" aria-hidden />
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
