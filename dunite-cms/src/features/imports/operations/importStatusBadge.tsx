'use client';

import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  uploaded: 'bg-slate-100 text-slate-700 border-slate-200',
  validating: 'bg-amber-50 text-amber-800 border-amber-200',
  validated: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  staging: 'bg-sky-50 text-sky-800 border-sky-200',
  staged: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  queued: 'bg-cyan-50 text-cyan-900 border-cyan-200',
  processing: 'bg-violet-50 text-violet-900 border-violet-200',
  completed: 'bg-green-50 text-green-900 border-green-200',
  partial_success: 'bg-amber-50 text-amber-900 border-amber-300',
  failed: 'bg-red-50 text-red-900 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export function ImportStatusBadge({
  status,
  className,
  compact,
}: {
  status: string;
  className?: string;
  compact?: boolean;
}) {
  const tone = STATUS_STYLES[status] ?? 'bg-muted text-foreground border-border';
  return (
    <span
      role="status"
      aria-label={`Import status ${status}`}
      className={cn(
        'inline-flex items-center rounded-full border font-medium tabular-nums',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs',
        tone,
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
