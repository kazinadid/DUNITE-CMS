'use client';

import { Activity, Cpu, Rows3, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatLocalTime } from '@/lib/date';
import { cn } from '@/lib/utils';

import type { ImportJobListItem, ImportJobProgressPayload } from '../../types';
import {
  isImportJobTerminalStatus,
  resolveImportQueueVisualState,
  type ImportQueueVisualState,
} from '../../lib/importJobStatusPresentation';
import {
  deriveJobDurationMs,
  estimateRemainingSeconds,
  formatDurationMs,
  formatRelativeFromNow,
  formatShortDateTime,
} from '../../lib/importJobTime';
import { ImportJobStatusBadge } from './ImportJobStatusBadge';

const STEPS: { key: ImportQueueVisualState; label: string }[] = [
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'staged', label: 'Staged' },
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Done' },
];

function stepIndex(visual: ImportQueueVisualState): number {
  if (visual === 'failed' || visual === 'retrying') return 4;
  const i = STEPS.findIndex((s) => s.key === visual);
  return Math.max(0, i >= 0 ? i : 0);
}

export interface ImportLiveQueuePanelProps {
  activeJobMeta: ImportJobListItem | undefined;
  progress: ImportJobProgressPayload | null;
  progressLoading: boolean;
  isPolling: boolean;
  onRefreshProgress: () => void;
}

export function ImportLiveQueuePanel({
  activeJobMeta,
  progress,
  progressLoading,
  isPolling,
  onRefreshProgress,
}: ImportLiveQueuePanelProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const importedRef = useRef<{ t: number; n: number } | null>(null);
  const [rpsDisplay, setRpsDisplay] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!progress) {
        importedRef.current = null;
        setRpsDisplay(null);
        return;
      }
      const t = Date.now();
      const n = progress.imported_rows;
      const prev = importedRef.current;
      importedRef.current = { t, n };
      if (!prev || t - prev.t < 400) return;
      const dt = (t - prev.t) / 1000;
      const dr = n - prev.n;
      if (dt > 0 && dr >= 0) setRpsDisplay(dr / dt);
    }, 0);
    return () => window.clearTimeout(id);
  }, [progress]);

  const effectiveStatus = progress?.status ?? activeJobMeta?.status ?? '';
  const visual = resolveImportQueueVisualState(effectiveStatus);
  const ix = stepIndex(visual);

  const pendingApprox = progress
    ? (progress.pending_importable ?? 0) + (progress.importing_rows ?? 0)
    : null;
  const etaSec =
    progress?.eta_seconds != null
      ? progress.eta_seconds
      : pendingApprox != null && progress
      ? estimateRemainingSeconds({
          pendingRows: pendingApprox,
          rowsPerSecond: rpsDisplay,
        })
      : null;

  const durationMs = deriveJobDurationMs({
    started_at: progress?.started_at ?? activeJobMeta?.started_at ?? null,
    completed_at: progress?.completed_at ?? activeJobMeta?.completed_at ?? null,
    created_at: progress?.created_at ?? activeJobMeta?.created_at ?? null,
  });

  const heartbeatLabel = progress?.processing_heartbeat_at
    ? formatRelativeFromNow(progress.processing_heartbeat_at)
    : activeJobMeta?.processing_heartbeat_at
      ? formatRelativeFromNow(activeJobMeta.processing_heartbeat_at)
      : '—';

  const pct = Math.min(100, Math.max(0, progress?.progress_pct ?? 0));

  const summaryLine =
    !activeJobMeta?.id && !progress?.id ? (
      <p className="text-sm text-muted-foreground">Select a job from the history table.</p>
    ) : null;

  const terminal = effectiveStatus ? isImportJobTerminalStatus(effectiveStatus) : false;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Live queue status</p>
            {effectiveStatus ? <ImportJobStatusBadge status={effectiveStatus} /> : null}
            {progressLoading ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Updating…</span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {activeJobMeta?.file_name ?? progress?.file_name ?? 'No job selected'}
          </p>
        </div>
        <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={() => onRefreshProgress()}>
          Refresh
        </Button>
      </div>

      {!activeJobMeta?.id && !progress?.id ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
          {summaryLine}
        </div>
      ) : null}

      {activeJobMeta || progress ? (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1',
                isPolling
                  ? 'bg-primary/10 text-primary ring-primary/25'
                  : 'bg-muted/60 ring-foreground/10',
              )}
            >
              <Activity className="size-3" aria-hidden />
              {isPolling ? 'Polling' : terminal ? 'Idle' : 'Watching'}
            </span>
          </div>

          <div className="grid gap-1 sm:grid-cols-5">
            {STEPS.map((step, idx) => {
              const active = idx === ix;
              const done = idx < ix;
              return (
                <div
                  key={step.key}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px]',
                    active && 'border-primary/40 bg-primary/[0.06] font-semibold text-foreground',
                    done && !active && 'border-emerald-500/25 bg-emerald-500/[0.04] text-emerald-900',
                    !done && !active && 'border-foreground/10 bg-muted/20 text-muted-foreground',
                  )}
                >
                  <span className="tabular-nums text-[10px] text-muted-foreground">{idx + 1}</span>
                  {step.label}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Progress</span>
              <span className="font-medium tabular-nums text-foreground">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted shadow-inner">
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r from-primary/90 to-primary transition-[width] duration-700 ease-out',
                  (visual === 'processing' || visual === 'queued') && 'animate-pulse',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-foreground/10 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Rows3 className="size-3" aria-hidden />
                Rows &amp; queue
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Imported</dt>
                  <dd className="font-medium tabular-nums">{progress?.imported_rows?.toLocaleString() ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Pending</dt>
                  <dd className="font-medium tabular-nums">{progress?.pending_importable?.toLocaleString() ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Queue position</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.queue_position != null ? `~${progress.queue_position}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Retries</dt>
                  <dd className="font-medium tabular-nums">
                    {progress != null ? `${progress.job_retry_count}/${progress.max_job_retries}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Posts created</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.posts_created != null ? progress.posts_created.toLocaleString() : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Scheduled</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.scheduled_posts != null ? progress.scheduled_posts.toLocaleString() : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="size-3" aria-hidden />
                Throughput / ETA
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Throughput</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.rows_per_second != null
                      ? `${progress.rows_per_second.toFixed(1)} rows/s`
                      : rpsDisplay != null
                        ? `${rpsDisplay.toFixed(1)} rows/s`
                        : 'Estimating…'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Est. completion</dt>
                  <dd className="font-medium">
                    {etaSec == null ? '—' : etaSec === 0 ? 'Now' : formatDurationMs(Math.round(etaSec * 1000))}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium tabular-nums">{formatDurationMs(durationMs ?? null)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Worker</dt>
                  <dd className="font-medium tabular-nums">{progress?.worker_id ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Publishing-ready</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.publishing_ready_posts != null ? progress.publishing_ready_posts.toLocaleString() : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Media attached</dt>
                  <dd className="font-medium tabular-nums">
                    {progress?.media_assets_attached != null ? progress.media_assets_attached.toLocaleString() : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
            <div className="rounded-md border border-foreground/10 bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide">Started</p>
              <p className="mt-1 text-foreground">
                {progress?.started_at || activeJobMeta?.started_at
                  ? `${formatShortDateTime(progress?.started_at ?? activeJobMeta?.started_at)} (${formatRelativeFromNow(progress?.started_at ?? activeJobMeta?.started_at)})`
                  : '—'}
              </p>
            </div>
            <div className="rounded-md border border-foreground/10 bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide">Worker heartbeat</p>
              <p className="mt-1 text-foreground">{heartbeatLabel}</p>
            </div>
            <div className="rounded-md border border-foreground/10 bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide">Now</p>
              <p className="mt-1 font-mono tabular-nums text-foreground">
                {formatLocalTime(now)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
