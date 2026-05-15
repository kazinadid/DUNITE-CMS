'use client';

import { useEffect, useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';

import type { Role } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useImportJobProgressPoll } from '../../hooks/useImportJobProgressPoll';
import { useImportOperationsConsole } from '../../hooks/useImportOperationsConsole';

import type { NormalizedImportRow } from '../../types';
import { ImportActionToolbar } from './ImportActionToolbar';
import { ImportHistoryTable } from './ImportHistoryTable';
import { ImportLiveQueuePanel } from './ImportLiveQueuePanel';

const SHOW_DEV_PANEL = process.env.NODE_ENV === 'development';

export interface ImportOperationsConsoleProps {
  canMutate: boolean;
  rows: NormalizedImportRow[];
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  workflowReady: boolean;
  /** Dashboard role — used for admin-only actions (e.g. recover workers). */
  debugRole?: Role;
  className?: string;
}

export function ImportOperationsConsole({
  canMutate,
  rows,
  fileName,
  fileKind,
  workflowReady,
  debugRole,
  className,
}: ImportOperationsConsoleProps) {
  const ops = useImportOperationsConsole({
    canMutate,
    rows,
    fileName,
    fileKind,
    workflowReady,
  });

  const { pollRefreshRef } = ops;

  const activeJobMeta = useMemo(
    () => ops.history.find((j) => j.id === ops.activeJobId),
    [ops.history, ops.activeJobId],
  );

  const { progress, refresh, loading: progressLoading, isPolling } = useImportJobProgressPoll(
    ops.activeJobId,
    Boolean(ops.activeJobId),
    activeJobMeta?.status,
  );

  useEffect(() => {
    pollRefreshRef.current = refresh;
  }, [pollRefreshRef, refresh]);

  const busyIdle = ops.busy === 'idle';

  return (
    <section
      className={cn('mx-auto w-full max-w-[1200px] min-w-0 space-y-4 overflow-x-hidden', className)}
      aria-labelledby="import-operations-console-title"
    >
      <header className="space-y-1">
        <h2 id="import-operations-console-title" className="text-lg font-semibold tracking-tight text-foreground">
          Bulk import operations
        </h2>
        <p className="text-sm text-muted-foreground">
          Stage validated rows, move jobs through the queue, and observe worker progress — without leaving this screen.
        </p>
      </header>

      {SHOW_DEV_PANEL && (
        <details className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] text-amber-950 ring-1 ring-amber-500/15 dark:text-amber-100">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Developer diagnostics (hidden until opened)</summary>
          <div className="border-t border-amber-500/15 px-3 py-2 font-mono text-[10px]">
            <p>UI role: {debugRole ?? '—'} · Auth UID (client): {ops.authClientUid ?? '—'}</p>
            {ops.lastStagingDiag ? (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-foreground">
                {JSON.stringify(ops.lastStagingDiag, null, 2)}
              </pre>
            ) : (
              <p className="mt-1 text-muted-foreground">No staging diagnostics recorded.</p>
            )}
          </div>
        </details>
      )}

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start xl:gap-6">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <ImportActionToolbar
            canMutate={canMutate}
            workflowReady={workflowReady}
            hasPreviewRows={rows.length > 0}
            activeJobId={ops.activeJobId}
            activeStatus={activeJobMeta?.status}
            busy={ops.busy}
            lastAction={ops.lastToolbarAction}
            showRecoverWorkers={debugRole === 'admin'}
            onStage={() => void ops.handleStage()}
            onQueue={() => ops.activeJobId && void ops.handleEnqueue(ops.activeJobId)}
            onQueueAndStart={() => ops.activeJobId && void ops.handleQueueAndStart(ops.activeJobId)}
            onRunProcessing={() => ops.activeJobId && void ops.handleRunChunks(ops.activeJobId)}
            onRefreshHistory={() => void ops.refreshHistory()}
            onRecoverWorkers={() => void ops.handleRecoverWorkers()}
          />

          {ops.stageSuccess && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2 text-sm text-emerald-950"
              role="status"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                <span>
                  Staged <strong>{ops.stageSuccess.stagedRows.toLocaleString()}</strong> row(s). Job{' '}
                  <code className="rounded bg-background/70 px-1 text-[11px]">{ops.stageSuccess.jobId.slice(0, 8)}</code>{' '}
                  is ready.
                </span>
              </span>
              <Button type="button" variant="ghost" size="xs" onClick={() => ops.setStageSuccess(null)}>
                Dismiss
              </Button>
            </div>
          )}

          <div className="min-h-[min(520px,60vh)]">
            <ImportHistoryTable
              jobs={ops.history}
              activeJobId={ops.activeJobId}
              expandedJobIds={ops.expandedJobIds}
              onToggleExpand={ops.toggleExpandJob}
              failureDiagByJob={ops.failureDiagByJob}
              failureDiagLoading={ops.failureDiagLoading}
              onEnsureFailureDiag={(id) => void ops.ensureFailureDiag(id)}
              chunkHistoryByJob={ops.chunkHistoryByJob}
              chunkHistoryLoading={ops.chunkHistoryLoading}
              onEnsureChunkHistory={(id) => void ops.ensureChunkHistory(id)}
              canMutate={canMutate}
              busyIdle={busyIdle}
              onSelect={ops.setActiveJobId}
              onQueue={(id) => void ops.handleEnqueue(id)}
              onQueueAndStart={(id) => void ops.handleQueueAndStart(id)}
              onRunChunks={(id) => void ops.handleRunChunks(id)}
              onCancel={(id) => void ops.handleCancel(id)}
              onRetry={(id) => void ops.handleRetryFailed(id)}
              hasMore={ops.hasMoreHistory}
              loading={ops.historyLoading}
              onLoadMore={() => void ops.loadMoreHistory()}
            />
          </div>
        </div>

        <div className="min-h-[min(360px,50vh)] lg:sticky lg:top-24">
          <ImportLiveQueuePanel
            activeJobMeta={activeJobMeta}
            progress={progress}
            progressLoading={progressLoading}
            isPolling={isPolling}
            onRefreshProgress={() => void refresh()}
          />
        </div>
      </div>
    </section>
  );
}
