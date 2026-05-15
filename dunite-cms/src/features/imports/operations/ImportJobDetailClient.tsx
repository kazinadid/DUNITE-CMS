'use client';

import dayjs from 'dayjs';
import { ArrowLeft, ExternalLink, ListTree, Loader2, Play, RefreshCw, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  cancelImportJobServerAction,
  enqueueImportJobServerAction,
  executeImportJobChunkServerAction,
  getImportFailureDiagnosticsServerAction,
  retryFailedImportRowsServerAction,
} from '@/app/actions/importJobsActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Role } from '@/features/auth';
import { canRunBatchImport } from '@/lib/rbac';

import { useImportJobProgressPoll } from '../hooks/useImportJobProgressPoll';
import type { ImportFailureGroup, ImportJobProgressPayload, ImportJobTableRow } from '../types';

import { ImportStatusBadge } from './importStatusBadge';
import { QueueHealthIndicator } from './queueHealthIndicator';

export interface ImportJobDetailClientProps {
  role: Role;
  detail: {
    job: ImportJobTableRow;
    failure_sample: { row_number: number; error_message: string | null }[];
  };
}

export function ImportJobDetailClient({ role, detail }: ImportJobDetailClientProps) {
  const canMutate = canRunBatchImport(role);
  const { job: initialJob, failure_sample } = detail;
  const jobId = initialJob.id;

  const job = initialJob;
  const router = useRouter();
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagGroups, setDiagGroups] = useState<ImportFailureGroup[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);

  const { progress, refresh } = useImportJobProgressPoll(jobId, true, job.status);

  const display = useMemo((): ImportJobProgressPayload => {
    if (progress) return progress;
    const total = job.total_rows ?? 0;
    const imported = job.imported_rows ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((imported / total) * 100)) : 0;
    return {
      id: job.id,
      file_name: job.file_name,
      status: job.status,
      total_rows: total,
      imported_rows: imported,
      valid_rows: job.valid_rows ?? 0,
      invalid_rows: job.invalid_rows ?? 0,
      duplicate_rows: job.duplicate_rows ?? 0,
      warning_rows: job.warning_rows ?? 0,
      pending_importable: 0,
      importing_rows: 0,
      progress_pct: pct,
      execution_stats: job.execution_stats ?? {},
      queued_at: job.queued_at ?? null,
      processing_heartbeat_at: job.processing_heartbeat_at ?? null,
      job_retry_count: job.job_retry_count ?? 0,
      max_job_retries: job.max_job_retries ?? 12,
      queue_position: job.queue_position ?? null,
      created_at: job.created_at,
      started_at: job.started_at ?? null,
      completed_at: job.completed_at ?? null,
    };
  }, [progress, job]);

  const loadDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await getImportFailureDiagnosticsServerAction(jobId);
      if (!res.ok) toast.error(res.message);
      else setDiagGroups(res.groups ?? []);
    } finally {
      setDiagLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (diagOpen) void loadDiag();
  }, [diagOpen, loadDiag]);

  const runChunk = async () => {
    const res = await executeImportJobChunkServerAction(jobId);
    if (!res.ok) toast.error(res.message ?? 'Chunk failed');
    else if (res.finished) toast.success(`Finished: ${res.jobStatus}`);
    else toast.message(`Processed ${res.processedThisChunk} row(s) — run again if needed.`);
    await refresh();
    router.refresh();
  };

  const activityHref = `/dashboard/activity?entity_type=import_job&entity_id=${encodeURIComponent(jobId)}`;

  return (
    <div className="mx-auto w-full max-w-[min(100vw-2rem,960px)] space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" asChild className="gap-2">
          <Link href="/dashboard/imports/operations">
            <ArrowLeft className="size-4" />
            Operations
          </Link>
        </Button>
        {canMutate && (
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/imports">Upload</Link>
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={activityHref} className="inline-flex items-center gap-1">
            Activity <ExternalLink className="size-3.5 opacity-60" />
          </a>
        </Button>
      </div>

      <header className="space-y-2">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{job.file_name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <ImportStatusBadge status={display.status} />
          <span aria-hidden>·</span>
          <span>Uploader {job.uploader_label}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">Retries {job.job_retry_count ?? 0}/{job.max_job_retries ?? 12}</span>
        </div>
      </header>

      <Card className="border-foreground/10">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Execution</CardTitle>
          <CardDescription>Chunk progress, queue position, and heartbeat freshness.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${display.progress_pct}%` }}
              role="progressbar"
              aria-valuenow={display.progress_pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Import execution progress"
            />
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Imported</span>{' '}
              <span className="font-medium tabular-nums">{display.imported_rows}</span> /{' '}
              <span className="tabular-nums">{display.total_rows}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Queue</span>{' '}
              <span className="font-medium tabular-nums">{display.queue_position ?? '—'}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Chunks</span>{' '}
              <span className="font-medium tabular-nums">{display.execution_stats.chunks_completed ?? 0}</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Heartbeat</span>
              <QueueHealthIndicator status={display.status} heartbeatIso={display.processing_heartbeat_at} />
            </p>
          </div>
          {canMutate && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {display.status === 'staged' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void enqueueImportJobServerAction(jobId).then((r) => {
                      if (r.ok) toast.success('Queued');
                      else toast.error(r.message);
                    })
                  }
                >
                  Queue
                </Button>
              )}
              {['queued', 'processing'].includes(display.status) && (
                <Button type="button" size="sm" onClick={() => void runChunk()} className="gap-2">
                  <Play className="size-4" />
                  Run chunk
                </Button>
              )}
              {['failed', 'partial_success', 'completed'].includes(display.status) && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() =>
                    void retryFailedImportRowsServerAction(jobId).then((r) =>
                      r.ok ? toast.success(`Retry prepared (${r.reset ?? 0} rows)`) : toast.error(r.message),
                    )
                  }
                >
                  <RotateCcw className="size-4" />
                  Retry failures
                </Button>
              )}
              {['uploaded', 'validated', 'staging', 'staged', 'queued', 'processing'].includes(display.status) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void cancelImportJobServerAction(jobId).then((r) =>
                      r.ok ? toast.message('Cancelled') : toast.error(r.message),
                    )
                  }
                >
                  Cancel job
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" className="gap-2" onClick={() => void refresh()}>
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-foreground/10">
          <CardHeader>
            <CardTitle className="text-base">Validation snapshot</CardTitle>
            <CardDescription>Row rollups from the last statistics sync.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm tabular-nums">
            <div>
              <p className="text-muted-foreground">Valid</p>
              <p className="font-semibold">{job.valid_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Warnings</p>
              <p className="font-semibold">{job.warning_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invalid</p>
              <p className="font-semibold">{job.invalid_rows ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duplicates</p>
              <p className="font-semibold">{job.duplicate_rows ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-foreground/10">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
            <CardDescription>Key lifecycle timestamps for this job.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Created</span>{' '}
              <time dateTime={job.created_at}>{dayjs(job.created_at).format('MMM D, YYYY HH:mm')}</time>
            </p>
            {job.queued_at && (
              <p>
                <span className="text-muted-foreground">Queued</span>{' '}
                <time dateTime={job.queued_at}>{dayjs(job.queued_at).format('MMM D, YYYY HH:mm')}</time>
              </p>
            )}
            {job.started_at && (
              <p>
                <span className="text-muted-foreground">Processing started</span>{' '}
                <time dateTime={job.started_at}>{dayjs(job.started_at).format('MMM D, YYYY HH:mm')}</time>
              </p>
            )}
            {job.completed_at && (
              <p>
                <span className="text-muted-foreground">Completed</span>{' '}
                <time dateTime={job.completed_at}>{dayjs(job.completed_at).format('MMM D, YYYY HH:mm')}</time>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {job.error_summary && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Error summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive/90">{job.error_summary}</CardContent>
        </Card>
      )}

      <Card className="border-foreground/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Row failures</CardTitle>
            <CardDescription>Sample of failed rows (first 80 by row number).</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setDiagOpen((o) => !o)}>
            <ListTree className="size-4" />
            Grouped diagnostics
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {diagOpen && (
            <div className="rounded-lg border border-foreground/10 bg-muted/30 p-3 text-sm">
              {diagLoading ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading diagnostics" />
              ) : diagGroups.length === 0 ? (
                <p className="text-muted-foreground">No grouped failures.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {diagGroups.map((g) => (
                    <li key={g.error_message} className="flex justify-between gap-2 text-xs">
                      <span className="min-w-0 break-words">{g.error_message}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">×{g.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {failure_sample.length === 0 ? (
              <li className="text-muted-foreground">No failures in sample window.</li>
            ) : (
              failure_sample.map((f) => (
                <li key={f.row_number} className="flex gap-2 rounded border border-foreground/5 bg-muted/20 px-2 py-1">
                  <span className="w-10 shrink-0 font-mono text-muted-foreground">#{f.row_number}</span>
                  <span className="min-w-0 break-words">{f.error_message ?? '—'}</span>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
