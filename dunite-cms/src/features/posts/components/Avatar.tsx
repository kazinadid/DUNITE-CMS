// ============================================================================
//  Avatar — initials in a deterministically-coloured circle.
//  No DB column for avatar_url yet, so we lean on initials. The colour is
//  derived from the user id so each author has a stable identity in the UI.
// ============================================================================

interface AvatarProps {
  name?:    string | null;
  email?:   string | null;
  /** Used to pick a stable colour per user. */
  seed?:    string;
  size?:    'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
};

// Pleasant, accessible-on-white palette. Each entry pairs a background tint
// with a foreground that maintains 4.5:1 contrast.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: 'bg-rose-100',     fg: 'text-rose-800'     },
  { bg: 'bg-amber-100',    fg: 'text-amber-900'    },
  { bg: 'bg-emerald-100',  fg: 'text-emerald-800'  },
  { bg: 'bg-sky-100',      fg: 'text-sky-800'      },
  { bg: 'bg-indigo-100',   fg: 'text-indigo-800'   },
  { bg: 'bg-fuchsia-100',  fg: 'text-fuchsia-800'  },
  { bg: 'bg-teal-100',     fg: 'text-teal-800'     },
];

function pickColor(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function deriveInitials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split('@')[0] || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  email,
  seed,
  size = 'md',
  className = '',
}: AvatarProps) {
  const initials = deriveInitials(name, email);
  const palette  = pickColor(seed ?? name ?? email ?? 'unknown');
  const label    = name?.trim() || email || 'Unknown user';

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex select-none items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-black/5 ${SIZES[size]} ${palette.bg} ${palette.fg} ${className}`}
    >
      {initials}
    </span>
  );
}
