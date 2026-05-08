// ============================================================================
//  PlatformBadge — small, on-brand pill identifying a target social platform.
//  Reusable across the feed, the preview dialog and the composer summary.
// ============================================================================

interface PlatformBadgeProps {
  platform:  string;
  size?:    'sm' | 'md';
  className?: string;
}

interface PlatformStyle {
  label: string;
  /** Brand dot colour (sufficient contrast on white). */
  dot:   string;
  /** Subtle bg + text tint for the pill. */
  bg:    string;
  text:  string;
  ring:  string;
}

const PLATFORMS: Record<string, PlatformStyle> = {
  facebook: {
    label: 'Facebook',
    dot:   '#1877F2',
    bg:    'bg-blue-50',
    text:  'text-blue-700',
    ring:  'ring-blue-100',
  },
  twitter: {
    label: 'Twitter',
    dot:   '#0F1419',
    bg:    'bg-gray-50',
    text:  'text-gray-800',
    ring:  'ring-gray-200',
  },
  linkedin: {
    label: 'LinkedIn',
    dot:   '#0A66C2',
    bg:    'bg-sky-50',
    text:  'text-sky-700',
    ring:  'ring-sky-100',
  },
  instagram: {
    label: 'Instagram',
    dot:   '#E1306C',
    bg:    'bg-pink-50',
    text:  'text-pink-700',
    ring:  'ring-pink-100',
  },
};

const FALLBACK: PlatformStyle = {
  label: 'Platform',
  dot:   '#9CA3AF',
  bg:    'bg-gray-50',
  text:  'text-gray-700',
  ring:  'ring-gray-200',
};

const SIZES = {
  sm: 'gap-1 px-1.5 py-0.5 text-[11px]',
  md: 'gap-1.5 px-2 py-0.5 text-xs',
} as const;

export function PlatformBadge({
  platform,
  size = 'md',
  className = '',
}: PlatformBadgeProps) {
  const key = platform.toLowerCase();
  const s   = PLATFORMS[key] ?? { ...FALLBACK, label: platform };

  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ring-1 ring-inset ${SIZES[size]} ${s.bg} ${s.text} ${s.ring} ${className}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {s.label}
    </span>
  );
}
