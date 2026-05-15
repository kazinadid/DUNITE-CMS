'use client';

import { cn } from '@/lib/utils';

import type { GroupedIssueRollup } from '../lib/groupIssuesFromRows';

export interface ImportGroupedIssuesPanelProps {
  errors: GroupedIssueRollup[];
  warnings: GroupedIssueRollup[];
  className?: string;
}

/** Compact grouped code rollups for the visible preview slice. */
export function ImportGroupedIssuesPanel({ errors, warnings, className }: ImportGroupedIssuesPanelProps) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div
      className={cn('grid gap-3 text-xs md:grid-cols-2', className)}
      role="region"
      aria-label="Grouped validation issues in current view"
    >
      {errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg bg-destructive/5 p-3 ring-1 ring-destructive/15">
          <p className="mb-2 font-medium text-destructive">Errors by code</p>
          <ul className="space-y-1.5 text-muted-foreground">
            {errors.map((e) => (
              <li key={e.code} className="flex justify-between gap-2">
                <code className="truncate rounded bg-background/80 px-1 text-[10px] text-foreground">{e.code}</code>
                <span className="shrink-0 tabular-nums text-foreground">×{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg bg-amber-500/5 p-3 ring-1 ring-amber-500/20">
          <p className="mb-2 font-medium text-amber-900">Warnings by code</p>
          <ul className="space-y-1.5 text-muted-foreground">
            {warnings.map((w) => (
              <li key={w.code} className="flex justify-between gap-2">
                <code className="truncate rounded bg-background/80 px-1 text-[10px] text-foreground">{w.code}</code>
                <span className="shrink-0 tabular-nums text-foreground">×{w.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
