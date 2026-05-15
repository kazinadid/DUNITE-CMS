'use client';

import type { ReactNode } from 'react';
import { AlertOctagon, CheckCircle2, Copy, Loader2, SkipForward, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ImportValidationSummary } from '../types';
import { topIssueCodes } from '../validation/buildValidationSummary';

export interface ValidationSummaryBarProps {
  validation: ImportValidationSummary;
  /** When true, show a compact "still computing" affordance (future async re-validate). */
  pending?: boolean;
  className?: string;
}

export function ValidationSummaryBar({ validation, pending, className }: ValidationSummaryBarProps) {
  const topErr = topIssueCodes(validation.errorsByCode, 4);
  const topWarn = topIssueCodes(validation.warningsByCode, 4);

  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex flex-col gap-3 rounded-xl border border-foreground/10 bg-background/95 p-4 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-background/85',
        className,
      )}
      role="region"
      aria-label="Import validation summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Validation</span>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Validating" />}
          <ReadinessMeter pct={validation.readinessPct} />
        </div>
        <p className="text-xs text-muted-foreground">
          Staging only — nothing is written to posts until you run a server commit step.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatChip
          icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
          label="Valid"
          value={validation.validRows}
        />
        <StatChip
          icon={<TriangleAlert className="size-3.5 text-amber-600" />}
          label="Warnings"
          value={validation.warningRows}
        />
        <StatChip
          icon={<Copy className="size-3.5 text-violet-600" />}
          label="Duplicates"
          value={validation.duplicateRows}
        />
        <StatChip
          icon={<AlertOctagon className="size-3.5 text-destructive" />}
          label="Invalid"
          value={validation.invalidRows}
        />
        <StatChip
          icon={<SkipForward className="size-3.5 text-muted-foreground" />}
          label="Skipped"
          value={validation.skippedRows}
        />
        <StatChip label="Total rows" value={validation.totalRows} emphasize />
        <StatChip label="Ready to stage" value={validation.stagingReadyRows} emphasize />
      </div>

      {(topErr.length > 0 || topWarn.length > 0) && (
        <div className="grid gap-3 text-xs md:grid-cols-2">
          {topErr.length > 0 && (
            <div className="rounded-lg bg-destructive/5 p-3 ring-1 ring-destructive/15">
              <p className="mb-1.5 font-medium text-destructive">Top errors</p>
              <ul className="space-y-1 text-muted-foreground">
                {topErr.map(({ code, count }) => (
                  <li key={code}>
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">{code}</code>{' '}
                    <span className="text-foreground">×{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topWarn.length > 0 && (
            <div className="rounded-lg bg-amber-500/5 p-3 ring-1 ring-amber-500/20">
              <p className="mb-1.5 font-medium text-amber-800">Top warnings</p>
              <ul className="space-y-1 text-muted-foreground">
                {topWarn.map(({ code, count }) => (
                  <li key={code}>
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">{code}</code>{' '}
                    <span className="text-foreground">×{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessMeter({ pct }: { pct: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-foreground/10 bg-muted/40 px-3 py-1 text-xs font-medium"
      title="Share of non-skipped rows that are valid, warning, or duplicate-tier (no blocking errors)."
    >
      <span className="text-muted-foreground">Readiness</span>
      <span className="tabular-nums text-foreground">{pct}%</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
    </div>
  );
}

function StatChip({
  label,
  value,
  icon,
  emphasize,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-[100px] items-center gap-2 rounded-lg border border-foreground/10 bg-card px-3 py-2',
        emphasize && 'ring-1 ring-foreground/15',
      )}
    >
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="text-lg leading-tight font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
