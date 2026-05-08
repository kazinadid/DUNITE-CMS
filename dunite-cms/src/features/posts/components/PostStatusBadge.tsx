import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';

import type { PostStatus } from '../types';

interface StatusStyle {
  label:   string;
  icon:    LucideIcon;
  /** Background + text colours for the pill. */
  bg:      string;
  text:    string;
  ring:    string;
  /** Whether the icon should spin (used by `publishing`). */
  spin?:   boolean;
}

const STYLES: Record<PostStatus, StatusStyle> = {
  draft: {
    label: 'Draft',
    icon:  FileText,
    bg:    'bg-gray-100',
    text:  'text-gray-700',
    ring:  'ring-gray-300/50',
  },
  scheduled: {
    label: 'Scheduled',
    icon:  Clock,
    bg:    'bg-amber-50',
    text:  'text-amber-700',
    ring:  'ring-amber-300/60',
  },
  publishing: {
    label: 'Publishing',
    icon:  Loader2,
    bg:    'bg-blue-50',
    text:  'text-blue-700',
    ring:  'ring-blue-300/60',
    spin:  true,
  },
  published: {
    label: 'Published',
    icon:  CheckCircle2,
    bg:    'bg-emerald-50',
    text:  'text-emerald-700',
    ring:  'ring-emerald-300/60',
  },
  failed: {
    label: 'Failed',
    icon:  AlertTriangle,
    bg:    'bg-red-50',
    text:  'text-red-700',
    ring:  'ring-red-300/60',
  },
  retrying: {
    label: 'Retrying',
    icon:  RefreshCw,
    bg:    'bg-orange-50',
    text:  'text-orange-800',
    ring:  'ring-orange-300/60',
    spin:  true,
  },
};

interface PostStatusBadgeProps {
  status:    PostStatus;
  size?:    'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: 'gap-1 px-1.5 py-0.5 text-[11px]',
  md: 'gap-1.5 px-2 py-0.5 text-xs',
} as const;

const ICON_SIZE: Record<NonNullable<PostStatusBadgeProps['size']>, number> = {
  sm: 11,
  md: 12,
};

export function PostStatusBadge({
  status,
  size = 'md',
  className = '',
}: PostStatusBadgeProps) {
  const s = STYLES[status];
  const Icon = s.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${SIZES[size]} ${s.bg} ${s.text} ${s.ring} ${className}`}
    >
      <Icon
        size={ICON_SIZE[size]}
        className={s.spin ? 'animate-spin' : ''}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
