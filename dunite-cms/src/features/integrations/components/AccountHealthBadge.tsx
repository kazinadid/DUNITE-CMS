'use client';

// ============================================================================
// DUNITE CMS — Account health badge component
// ============================================================================

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldOff,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { AccountHealthStatus } from '../types';
import { cn } from '@/lib/utils';

interface HealthStyle {
  label: string;
  icon: LucideIcon;
  bg: string;
  text: string;
  ring: string;
  spin?: boolean;
}

const STYLES: Record<AccountHealthStatus, HealthStyle> = {
  healthy: {
    label: 'Healthy',
    icon:  CheckCircle2,
    bg:    'bg-emerald-50',
    text:  'text-emerald-700',
    ring:  'ring-emerald-300/60',
  },
  warning: {
    label: 'Expiring soon',
    icon:  Clock,
    bg:    'bg-amber-50',
    text:  'text-amber-700',
    ring:  'ring-amber-300/60',
  },
  expired: {
    label: 'Expired',
    icon:  AlertTriangle,
    bg:    'bg-red-50',
    text:  'text-red-700',
    ring:  'ring-red-300/60',
  },
  disconnected: {
    label: 'Disconnected',
    icon:  WifiOff,
    bg:    'bg-gray-100',
    text:  'text-gray-600',
    ring:  'ring-gray-300/60',
  },
  permission_error: {
    label: 'Permission error',
    icon:  ShieldOff,
    bg:    'bg-orange-50',
    text:  'text-orange-700',
    ring:  'ring-orange-300/60',
  },
  reconnect_required: {
    label: 'Reconnect',
    icon:  RefreshCw,
    bg:    'bg-violet-50',
    text:  'text-violet-700',
    ring:  'ring-violet-300/60',
  },
};

interface AccountHealthBadgeProps {
  status: AccountHealthStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function AccountHealthBadge({
  status,
  size = 'md',
  className,
}: AccountHealthBadgeProps) {
  const s = STYLES[status] ?? STYLES['healthy'];
  const Icon = s.icon;
  const iconSize = size === 'sm' ? 11 : 12;
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const padding  = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset',
        textSize,
        padding,
        s.bg,
        s.text,
        s.ring,
        className,
      )}
    >
      <Icon
        size={iconSize}
        className={s.spin ? 'animate-spin' : ''}
        aria-hidden
      />
      {s.label}
    </span>
  );
}
