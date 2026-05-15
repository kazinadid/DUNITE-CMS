'use client';

import { cn } from '@/lib/utils';

import { getImportStatusPresentation } from '../../lib/importJobStatusPresentation';

export function ImportJobStatusBadge({ status, className }: { status: string; className?: string }) {
  const p = getImportStatusPresentation(status);
  const Icon = p.icon;
  const spin = status.toLowerCase() === 'processing';

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        p.badgeClass,
        className,
      )}
    >
      <Icon className={cn('size-3 shrink-0', spin && 'animate-spin')} aria-hidden />
      <span className="truncate">{p.label}</span>
    </span>
  );
}
