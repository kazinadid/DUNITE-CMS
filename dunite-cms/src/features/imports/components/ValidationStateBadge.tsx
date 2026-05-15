'use client';

import { cn } from '@/lib/utils';

import type { RowValidationState } from '../validation/validationTypes';

const STATE_STYLES: Record<
  RowValidationState,
  { label: string; className: string; description: string }
> = {
  valid: {
    label: 'Valid',
    className: 'bg-emerald-500/15 text-emerald-900 ring-1 ring-emerald-500/25',
    description: 'No blocking issues for this row.',
  },
  warning: {
    label: 'Warning',
    className: 'bg-amber-500/15 text-amber-950 ring-1 ring-amber-500/25',
    description: 'Non-blocking issues detected.',
  },
  duplicate: {
    label: 'Duplicate',
    className: 'bg-violet-500/15 text-violet-950 ring-1 ring-violet-500/25',
    description: 'Potential duplicate of another row in this file.',
  },
  invalid: {
    label: 'Invalid',
    className: 'bg-destructive/15 text-destructive ring-1 ring-destructive/25',
    description: 'Blocking errors must be fixed before staging.',
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-muted text-muted-foreground ring-1 ring-foreground/10',
    description: 'Row excluded from import (e.g. empty line).',
  },
};

export interface ValidationStateBadgeProps {
  state: RowValidationState;
  size?: 'sm' | 'md';
  className?: string;
}

export function validationStateMeta(state: RowValidationState) {
  return STATE_STYLES[state];
}

/**
 * Compact status pill for import preview rows and inspectors.
 */
export function ValidationStateBadge({ state, size = 'sm', className }: ValidationStateBadgeProps) {
  const meta = STATE_STYLES[state];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md font-semibold tabular-nums',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        meta.className,
        className,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
}
