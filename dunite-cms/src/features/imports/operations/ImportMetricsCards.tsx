'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock, Copy, Layers, Percent } from 'lucide-react';

import type { ImportOperationsSummary } from '../types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Activity;
  className?: string;
}) {
  return (
    <Card className={cn('border-foreground/10 shadow-sm', className)}>
      <CardContent className="flex gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function ImportMetricsCards({
  summary,
  counts,
  loading,
}: {
  summary: ImportOperationsSummary | null;
  counts: Record<string, number> | null;
  loading: boolean;
}) {
  if (loading && !summary) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const queued = counts?.queued ?? 0;
  const processing = counts?.processing ?? 0;
  const failed = (counts?.failed ?? 0) + (counts?.partial_success ?? 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Imports today"
        value={String(summary.imports_today)}
        hint={`${summary.completed_today} completed · ${summary.failed_or_partial_today} with issues`}
        icon={Layers}
      />
      <MetricCard
        label="Success rate (sample)"
        value={summary.success_rate_recent != null ? `${summary.success_rate_recent}%` : '—'}
        hint={`Last ${summary.sample_size} terminal jobs`}
        icon={Percent}
      />
      <MetricCard
        label="Avg duration (sample)"
        value={
          summary.avg_duration_ms_sample != null
            ? `${Math.round(summary.avg_duration_ms_sample / 1000)}s`
            : '—'
        }
        hint="Completed jobs with timestamps"
        icon={Clock}
      />
      <MetricCard
        label="Queue + pipeline"
        value={`${queued} / ${processing}`}
        hint={`Queued / processing · ${failed} need attention`}
        icon={Activity}
      />
      <MetricCard
        label="Dup rows (sample)"
        value={String(summary.duplicate_rows_sum_sample)}
        hint="Sum over recent 200 jobs"
        icon={Copy}
      />
      <MetricCard
        label="Invalid rows (sample)"
        value={String(summary.invalid_rows_sum_sample)}
        hint="Sum over recent 200 jobs"
        icon={AlertTriangle}
      />
      <MetricCard
        label="Staged"
        value={String(counts?.staged ?? 0)}
        hint="Awaiting queue"
        icon={Layers}
      />
      <MetricCard
        label="Completed (all)"
        value={String(counts?.completed ?? 0)}
        hint="Open operations table for filters"
        icon={CheckCircle2}
      />
    </div>
  );
}
