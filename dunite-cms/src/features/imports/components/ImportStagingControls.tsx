'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw, Square, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import {
  cancelImportJobServerAction,
  executeImportJobChunkServerAction,
  listRecentImportJobsServerAction,
  retryFailedImportRowsServerAction,
  stageImportJobServerAction,
} from '@/app/actions/importJobsActions';
import { getDefaultTimeZone } from '@/features/imports/lib/dates';
import { buildImportPreviewPayload } from '@/features/imports/preview/prepareImportPreview';

import type { ImportJobListItem, NormalizedImportRow } from '@/features/imports/types';

/** Auto-run execute chunks per click (bounded to keep server action time reasonable). */
const MAX_AUTO_CHUNKS = 40;

export interface ImportStagingControlsProps {
  canMutate: boolean;
  /** Parsed + validated rows ready to persist */
  rows: NormalizedImportRow[];
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  /** Import workflow reached `ready` with rows */
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

  const refreshHistory = useCallback(async () => {
    setBusy((b) => (b === 'executing' || b === 'staging' ? b : 'loading'));
    const res = await listRecentImportJobsServerAction(12);
    setBusy('idle');
    if (res.ok && res.jobs) setHistory(res.jobs);
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

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
      toast.success('Import staged — rows persisted for execution.');
      setActiveJobId(res.jobId);
      await refreshHistory();
    } finally {
      setBusy('idle');
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
        toast.message('Large import: click Execute again to continue processing.');
      }
      await refreshHistory();
    } finally {
      setBusy('idle');
    }
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
    }
  };

  const handleRetryFailed = async (jobId: string) => {
    setBusy('loading');
    const res = await retryFailedImportRowsServerAction(jobId);
    setBusy('idle');
    if (!res.ok) toast.error(res.message ?? 'Retry prep failed');
    else {
      toast.success(`Reset ${res.reset ?? 0} failed row(s) for re-execution.`);
      setActiveJobId(jobId);
      await refreshHistory();
    }
  };

  return (
    <Card className={cn('border-foreground/10', className)}>
      <CardHeader className="border-b bg-muted/30">
        <CardTitle className="text-base">Stage & execute</CardTitle>
        <CardDescription>
          Server-side pipeline: persist rows to Supabase, then run chunked post creation (draft / scheduled only — no
          platform publish yet).
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
            variant="default"
            size="sm"
            disabled={!canMutate || !activeJobId || busy !== 'idle'}
            onClick={() => activeJobId && void runExecuteChunks(activeJobId)}
            className="gap-2"
          >
            {busy === 'executing' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Execute import
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
          <p className="text-xs text-muted-foreground">
            Active job: <code className="rounded bg-muted px-1">{activeJobId}</code> — use Execute import (may require
            multiple clicks for very large files).
          </p>
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
                      {j.status} · rows {j.total_rows ?? 0} · imported {j.imported_rows ?? 0}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="xs" onClick={() => setActiveJobId(j.id)}>
                      Select
                    </Button>
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
