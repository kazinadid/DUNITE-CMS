'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree, Loader2, Play, RefreshCw, Square, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import {
  cancelImportJobServerAction,
  enqueueImportJobServerAction,
  executeImportJobChunkServerAction,
  getImportFailureDiagnosticsServerAction,
  listRecentImportJobsServerAction,
  retryFailedImportRowsServerAction,
  stageImportJobServerAction,
} from '@/app/actions/importJobsActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { useImportJobProgressPoll } from '../hooks/useImportJobProgressPoll';
import { getDefaultTimeZone } from '../lib/dates';
import { buildImportPreviewPayload } from '../preview/prepareImportPreview';

import type { ImportFailureGroup, ImportJobListItem, NormalizedImportRow } from '../types';

/** Auto-run execute chunks per click (bounded to keep server action time reasonable). */
const MAX_AUTO_CHUNKS = 40;

export interface ImportStagingControlsProps {
  canMutate: boolean;
  rows: NormalizedImportRow[];
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  workflowReady: boolean;
  className?: string;
}

export function ImportStagingControls({
  canMutate,
  rows,
  fileName,
  fileKind,
  workflowReady,
  className,
}: ImportStagingControlsProps) {
  const [busy, setBusy] = useState<'idle' | 'staging' | 'executing' | 'loading'>('idle');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportJobListItem[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagGroups, setDiagGroups] = useState<ImportFailureGroup[]>([]);

  const { progress, refresh } = useImportJobProgressPoll(activeJobId, !!activeJobId);

  const refreshHistory = useCallback(async () => {
    setBusy((b) => (b === 'executing' || b === 'staging' ? b : 'loading'));
    const res = await listRecentImportJobsServerAction(24);
    setBusy('idle');
    if (res.ok && res.jobs) setHistory(res.jobs);
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const loadDiagnostics = useCallback(async () => {
    if (!activeJobId) return;
    setDiagLoading(true);
    try {
      const res = await getImportFailureDiagnosticsServerAction(activeJobId);
      if (!res.ok) toast.error(res.message ?? 'Diagnostics failed');
      else setDiagGroups(res.groups ?? []);
    } finally {
      setDiagLoading(false);
    }
  }, [activeJobId]);

  useEffect(() => {
    if (diagOpen && activeJobId) void loadDiagnostics();
  }, [diagOpen, activeJobId, loadDiagnostics]);

  const handleStage = async () => {
    if (!canMutate || !workflowReady || rows.length === 0) return;
    setBusy('staging');
    try {
      const tz = getDefaultTimeZone();
      const payload = buildImportPreviewPayload(rows, tz);
      const res = await stageImportJobServerAction(payload, {
        fileName: fileName ?? 'import.csv',
        fileType: fileKind,
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success('Import staged — review, then queue for processing.');
      setActiveJobId(res.jobId);
      await refreshHistory();
    } finally {
      setBusy('idle');
    }
  };

  const handleEnqueue = async (jobId: string) => {
    setBusy('loading');
    const res = await enqueueImportJobServerAction(jobId);
    setBusy('idle');
    if (!res.ok) toast.error(res.message ?? 'Queue failed');
    else {
      toast.success('Import queued for workers.');
      await refreshHistory();
      void refresh();
    }
  };

  const runExecuteChunks = async (jobId: string) => {
    setBusy('executing');
    try {
      let finished = false;
      for (let i = 0; i < MAX_AUTO_CHUNKS && !finished; i++) {
        const chunk = await executeImportJobChunkServerAction(jobId);
        if (!chunk.ok) {
          toast.error(chunk.message ?? 'Execution failed');
          break;
        }
        if (chunk.finished) {
          finished = true;
          toast.success(`Import finished (${chunk.jobStatus ?? 'done'})`);
        }
      }
      if (!finished) {
        toast.message('Large import: click Run processing again to continue.');
      }
      await refreshHistory();
      void refresh();
    } finally {
      setBusy('idle');
    }
  };

  const handleQueueAndStart = async (jobId: string) => {
    setBusy('loading');
    try {
      const enq = await enqueueImportJobServerAction(jobId);
      if (!enq.ok) {
        toast.error(enq.message ?? 'Queue failed');
        return;
      }
      toast.success('Queued — starting processing chunks.');
    } finally {
      setBusy('idle');
    }
    await runExecuteChunks(jobId);
  };

  const handleCancel = async (jobId: string) => {
    setBusy('loading');
    const res = await cancelImportJobServerAction(jobId);
    setBusy('idle');
    if (!res.ok) toast.error(res.message ?? 'Cancel failed');
    else {
      toast.message('Import cancelled');
      if (activeJobId === jobId) setActiveJobId(null);
      await refreshHistory();
      void refresh();
    }
  };

  const handleRetryFailed = async (jobId: string) => {
    setBusy('loading');
    const res = await retryFailedImportRowsServerAction(jobId);
    setBusy('idle');
    if (!res.ok) toast.error(res.message ?? 'Retry prep failed');
    else {
      toast.success(`Reset ${res.reset ?? 0} row(s); job re-queued (retry ${res.reset ? 'ready' : 'n/a'}).`);
      setActiveJobId(jobId);
      await refreshHistory();
      void refresh();
    }
  };

  const activeJobMeta = history.find((j) => j.id === activeJobId);

  return (
    <Card className={cn('border-foreground/10', className)}>
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Stage, queue & process</CardTitle>
        <CardDescription>
          Staging persists rows. Queueing registers work for chunked workers. Processing creates draft/scheduled posts only
          (no platform publish) using SKIP LOCKED–safe row claims.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canMutate || !workflowReady || rows.length === 0 || busy !== 'idle'}
            onClick={() => void handleStage()}
            className="gap-2"
          >
            {busy === 'staging' ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            Stage import
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canMutate || !activeJobId || busy !== 'idle' || activeJobMeta?.status !== 'staged'}
            onClick={() => activeJobId && void handleEnqueue(activeJobId)}
            className="gap-2"
          >
            Queue import
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canMutate || !activeJobId || busy !== 'idle' || activeJobMeta?.status !== 'staged'}
            onClick={() => activeJobId && void handleQueueAndStart(activeJobId)}
            className="gap-2"
          >
            Queue &amp; start
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!canMutate || !activeJobId || busy !== 'idle'}
            onClick={() => activeJobId && void runExecuteChunks(activeJobId)}
            className="gap-2"
          >
            {busy === 'executing' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run processing
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== 'idle'}
            onClick={() => void refreshHistory()}
            className="gap-2"
          >
            <RefreshCw className="size-4" />
            Refresh history
          </Button>
        </div>

        {activeJobId && (
          <div className="space-y-2 rounded-lg border border-foreground/10 bg-muted/20 p-3 text-xs">
            <p className="text-muted-foreground">
              Active job: <code className="rounded bg-muted px-1">{activeJobId}</code>
              {activeJobMeta ? ` · ${activeJobMeta.status}` : ''}
            </p>
            {progress && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{progress.file_name}</span>
                  {progress.queue_position != null && (
                    <span className="text-[10px] text-muted-foreground">Queue ~{progress.queue_position}</span>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{ width: `${progress.progress_pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {progress.status} · pending {progress.pending_importable} · in flight {progress.importing_rows} ·
                  imported {progress.imported_rows} · retries {progress.job_retry_count}/{progress.max_job_retries} ·
                  chunks {progress.execution_stats.chunks_completed ?? 0}
                </p>
              </>
            )}
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
              onClick={() => setDiagOpen((o) => !o)}
            >
              {diagOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              <ListTree className="size-3.5" />
              Failure diagnostics
            </button>
            {diagOpen && (
              <div className="max-h-40 overflow-y-auto rounded border border-foreground/10 bg-background p-2 text-[11px]">
                {diagLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : diagGroups.length === 0 ? (
                  <p className="text-muted-foreground">No grouped failures (or none loaded).</p>
                ) : (
                  <ul className="space-y-1">
                    {diagGroups.map((g) => (
                      <li key={g.error_message} className="flex justify-between gap-2">
                        <span className="min-w-0 break-words text-foreground">{g.error_message}</span>
                        <span className="shrink-0 text-muted-foreground">×{g.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent imports</h4>
          <ul className="max-h-56 space-y-2 overflow-y-auto text-xs">
            {history.length === 0 ? (
              <li className="text-muted-foreground">No import jobs yet.</li>
            ) : (
              history.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-muted/20 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{j.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {j.status} · rows {j.total_rows ?? 0} · imported {j.imported_rows ?? 0} · r{' '}
                      {j.job_retry_count ?? 0}/{j.max_job_retries ?? 12}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button type="button" variant="ghost" size="xs" onClick={() => setActiveJobId(j.id)}>
                      Select
                    </Button>
                    {j.status === 'staged' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={!canMutate || busy !== 'idle'}
                        onClick={() => void handleEnqueue(j.id)}
                      >
                        Queue
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={!canMutate || busy !== 'idle'}
                      onClick={() => void handleCancel(j.id)}
                    >
                      <Square className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={!canMutate || busy !== 'idle'}
                      onClick={() => void handleRetryFailed(j.id)}
                    >
                      Retry
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
