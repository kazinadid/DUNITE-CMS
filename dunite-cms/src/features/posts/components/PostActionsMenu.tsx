'use client';

import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Post actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
      >
        <MoreVertical size={16} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <button
                key={`${a.label}-${i}`}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); a.onClick(); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition ${
                  a.destructive
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
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
