'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Copy, SkipForward, TriangleAlert, AlertOctagon } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ImportValidationSummary } from '../types';

function MetricCard({
  label,
  value,
  icon,
  emphasize,
  tone,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  emphasize?: boolean;
  tone?: 'default' | 'danger' | 'warn' | 'violet';
}) {
  const toneRing =
    tone === 'danger'
      ? 'ring-destructive/15'
      : tone === 'warn'
        ? 'ring-amber-500/20'
        : tone === 'violet'
          ? 'ring-violet-500/20'
          : 'ring-foreground/10';

  return (
    <div
      className={cn(
        'flex min-w-[7.5rem] flex-1 flex-col gap-1 rounded-lg border border-foreground/10 bg-card px-3 py-2.5',
        emphasize && 'ring-1',
        emphasize && toneRing,
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

export interface ImportPreviewMetricsCardsProps {
  validation: ImportValidationSummary | null;
  /** When filters/exclusions narrow the working set vs full file. */
  subtitle?: string | null;
  className?: string;
}

/**
 * Dense metric strip for visible rows (respects filters / exclusions via caller-provided summary).
 */
export function ImportPreviewMetricsCards({ validation, subtitle, className }: ImportPreviewMetricsCardsProps) {
  if (!validation) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-foreground/15 bg-muted/10 px-4 py-6 text-center text-xs text-muted-foreground',
          className,
        )}
        role="status"
      >
        Metrics appear after rows are validated.
      </div>
    );
  }

  const v = validation;

  return (
    <div className={cn('space-y-2', className)}>
      {subtitle ? <p className="text-[11px] text-muted-foreground">{subtitle}</p> : null}
      <div
        className="flex flex-wrap gap-2 rounded-xl border border-foreground/10 bg-muted/10 p-3"
        role="region"
        aria-label="Import metrics for visible rows"
      >
        <MetricCard label="Total" value={v.totalRows} emphasize />
        <MetricCard
          label="Valid"
          value={v.validRows}
          icon={<CheckCircle2 className="size-3 text-emerald-600" aria-hidden />}
        />
        <MetricCard
          label="Warnings"
          value={v.warningRows}
          tone="warn"
          icon={<TriangleAlert className="size-3 text-amber-600" aria-hidden />}
        />
        <MetricCard
          label="Duplicates"
          value={v.duplicateRows}
          tone="violet"
          icon={<Copy className="size-3 text-violet-600" aria-hidden />}
        />
        <MetricCard
          label="Invalid"
          value={v.invalidRows}
          tone="danger"
          icon={<AlertOctagon className="size-3 text-destructive" aria-hidden />}
        />
        <MetricCard label="Skipped" value={v.skippedRows} icon={<SkipForward className="size-3 opacity-60" aria-hidden />} />
        <MetricCard label="Ready to stage" value={v.stagingReadyRows} emphasize />
        <div className="flex min-w-[120px] flex-1 flex-col justify-center rounded-lg border border-foreground/10 bg-background/80 px-3 py-2">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Readiness</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{v.readinessPct}%</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, v.readinessPct))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
