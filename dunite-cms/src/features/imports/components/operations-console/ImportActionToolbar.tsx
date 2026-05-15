'use client';

import { Loader2, Pickaxe, Play, RefreshCw, UploadCloud } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Busy = 'idle' | 'staging' | 'executing' | 'loading' | 'recovering';

export interface ImportActionToolbarProps {
  canMutate: boolean;
  workflowReady: boolean;
  hasPreviewRows: boolean;
  activeJobId: string | null;
  activeStatus: string | undefined;
  busy: Busy;
  lastAction: 'idle' | 'success' | 'error';
  showRecoverWorkers: boolean;
  onStage: () => void;
  onQueue: () => void;
  onQueueAndStart: () => void;
  onRunProcessing: () => void;
  onRefreshHistory: () => void;
  onRecoverWorkers: () => void;
}

function ActionBtn({
  title,
  disabled,
  busyKey,
  busy,
  variant = 'default',
  onClick,
  children,
  className,
  'aria-keyshortcuts': ariaKs,
}: {
  title: string;
  disabled: boolean;
  busyKey?: Busy;
  busy: Busy;
  variant?: React.ComponentProps<typeof Button>['variant'];
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  'aria-keyshortcuts'?: string;
}) {
  const loading = busyKey != null && busy === busyKey;
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      aria-busy={loading}
      aria-keyshortcuts={ariaKs}
      className={cn(
        'min-h-9 shrink-0 justify-center gap-2 shadow-sm ring-1 ring-transparent transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

export function ImportActionToolbar({
  canMutate,
  workflowReady,
  hasPreviewRows,
  activeJobId,
  activeStatus,
  busy,
  lastAction,
  showRecoverWorkers,
  onStage,
  onQueue,
  onQueueAndStart,
  onRunProcessing,
  onRefreshHistory,
  onRecoverWorkers,
}: ImportActionToolbarProps) {
  const staged = activeStatus === 'staged';
  const idle = busy === 'idle';

  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-foreground/10 bg-background/90 p-2 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-background/85',
        lastAction === 'success' && 'ring-1 ring-emerald-500/25',
        lastAction === 'error' && 'ring-1 ring-destructive/20',
      )}
      role="toolbar"
      aria-label="Import queue actions"
    >
      <ActionBtn
        title="Persist validated rows as an import job (server)"
        aria-keyshortcuts="s"
        busyKey="staging"
        busy={busy}
        disabled={!canMutate || !workflowReady || !hasPreviewRows || !idle}
        onClick={onStage}
        className="max-sm:flex-1"
      >
        <UploadCloud className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Stage import</span>
        <span className="sm:hidden">Stage</span>
      </ActionBtn>

      <ActionBtn
        title="Register this job for workers (does not run chunks yet)"
        busyKey="loading"
        busy={busy}
        variant="secondary"
        disabled={!canMutate || !activeJobId || !idle || !staged}
        onClick={onQueue}
        className="max-sm:flex-1"
      >
        <span>Queue</span>
      </ActionBtn>

      <ActionBtn
        title="Queue job and immediately start chunked processing"
        busyKey="executing"
        busy={busy}
        variant="secondary"
        disabled={!canMutate || !activeJobId || !idle || !staged}
        onClick={onQueueAndStart}
        className="max-sm:flex-1"
      >
        <Play className="size-4 shrink-0" aria-hidden />
        <span className="hidden md:inline">Queue &amp; start</span>
        <span className="md:hidden">Start</span>
      </ActionBtn>

      <ActionBtn
        title="Run the next processing chunks for the active job"
        busyKey="executing"
        busy={busy}
        disabled={!canMutate || !activeJobId || !idle}
        onClick={onRunProcessing}
        className="max-sm:flex-1"
      >
        <Play className="size-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Run processing</span>
        <span className="sm:hidden">Run</span>
      </ActionBtn>

      <ActionBtn
        title="Reload import history from the server"
        busyKey="loading"
        busy={busy}
        variant="outline"
        disabled={!idle}
        onClick={onRefreshHistory}
        className="max-sm:flex-1"
      >
        <RefreshCw className="size-4 shrink-0" aria-hidden />
        <span className="hidden lg:inline">Refresh history</span>
        <span className="lg:hidden">Refresh</span>
      </ActionBtn>

      {showRecoverWorkers ? (
        <ActionBtn
          title="Re-queue stale processing jobs (admin — uses server RPC)"
          busyKey="recovering"
          busy={busy}
          variant="outline"
          disabled={!idle}
          onClick={onRecoverWorkers}
          className="max-sm:flex-1"
        >
          <Pickaxe className="size-4 shrink-0" aria-hidden />
          <span className="hidden xl:inline">Recover workers</span>
          <span className="xl:hidden">Recover</span>
        </ActionBtn>
      ) : null}
    </div>
  );
}
