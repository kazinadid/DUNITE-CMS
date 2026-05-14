'use client';

import { cn } from '@/lib/utils';

/** Heartbeat freshness for queue / worker UX (client-side heuristic). */
export function QueueHealthIndicator({
  status,
  heartbeatIso,
  staleAfterMinutes = 12,
  className,
}: {
  status: string;
  heartbeatIso: string | null | undefined;
  staleAfterMinutes?: number;
  className?: string;
}) {
  if (!['processing', 'queued'].includes(status)) {
    return (
      <span className={cn('text-[10px] text-muted-foreground tabular-nums', className)} aria-hidden>
        —
      </span>
    );
  }

  if (!heartbeatIso) {
    return (
      <span className={cn('text-[10px] text-amber-700', className)} title="No heartbeat yet">
        pending
      </span>
    );
  }

  const ageMs = Date.now() - new Date(heartbeatIso).getTime();
  const staleMs = staleAfterMinutes * 60_000;
  const fresh = ageMs < staleMs;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-medium tabular-nums',
        fresh ? 'text-emerald-700' : 'text-amber-800',
        className,
      )}
      title={fresh ? 'Heartbeat fresh' : 'Heartbeat stale — consider recovery'}
    >
      <span className={cn('size-1.5 rounded-full', fresh ? 'bg-emerald-500' : 'bg-amber-500')} aria-hidden />
      {fresh ? 'live' : 'stale'}
    </span>
  );
}
