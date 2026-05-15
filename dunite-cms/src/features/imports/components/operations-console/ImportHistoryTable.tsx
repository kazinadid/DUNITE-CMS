'use client';

import { memo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Square,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type { ImportFailureGroup, ImportJobListItem } from '../../types';
import { deriveJobDurationMs, formatDurationMs, formatShortDateTime } from '../../lib/importJobTime';
import { ImportJobStatusBadge } from './ImportJobStatusBadge';

function failureCount(job: ImportJobListItem): number {
  const f = job.execution_stats?.failed;
  if (typeof f === 'number') return f;
  return job.invalid_rows ?? 0;
}

export interface ImportHistoryTableProps {
  jobs: ImportJobListItem[];
  activeJobId: string | null;
  expandedJobIds: ReadonlySet<string>;
  onToggleExpand: (id: string) => void;
  failureDiagByJob: Record<string, ImportFailureGroup[]>;
  failureDiagLoading: string | null;
  onEnsureFailureDiag: (jobId: string) => void;
  canMutate: boolean;
  busyIdle: boolean;
  onSelect: (id: string) => void;
  onQueue: (id: string) => void;
  onQueueAndStart: (id: string) => void;
  onRunChunks: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

function RowImpl({
  job,
  active,
  expanded,
  onToggleExpand,
  failureGroups,
  failureLoading,
  onEnsureFailureDiag,
  canMutate,
  busyIdle,
  onSelect,
  onQueue,
  onQueueAndStart,
  onRunChunks,
  onCancel,
  onRetry,
}: {
  job: ImportJobListItem;
  active: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  failureGroups: ImportFailureGroup[] | undefined;
  failureLoading: boolean;
  onEnsureFailureDiag: (id: string) => void;
  canMutate: boolean;
  busyIdle: boolean;
  onSelect: (id: string) => void;
  onQueue: (id: string) => void;
  onQueueAndStart: (id: string) => void;
  onRunChunks: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const dur = formatDurationMs(deriveJobDurationMs(job));

  const openDiag = useCallback(() => {
    const nextOpen = !expanded;
    onToggleExpand(job.id);
    if (nextOpen) void onEnsureFailureDiag(job.id);
  }, [job.id, expanded, onEnsureFailureDiag, onToggleExpand]);

  return (
    <>
      <tr
        className={cn(
          'border-b border-foreground/5 transition-colors hover:bg-muted/30',
          active && 'bg-primary/[0.04]',
        )}
      >
        <td className="w-8 px-2 py-2 align-middle">
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-expanded={expanded}
            onClick={openDiag}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </td>
        <td className="min-w-0 px-2 py-2 align-middle">
          <button
            type="button"
            className="w-full truncate text-left font-medium text-foreground hover:underline"
            onClick={() => onSelect(job.id)}
          >
            {job.file_name}
          </button>
          <div className="truncate font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}…</div>
        </td>
        <td className="hidden lg:table-cell px-2 py-2 align-middle">
          <ImportJobStatusBadge status={job.status} className="max-w-[8rem]" />
        </td>
        <td className="hidden md:table-cell px-2 py-2 align-middle tabular-nums text-muted-foreground">
          {(job.total_rows ?? 0).toLocaleString()}
        </td>
        <td className="hidden md:table-cell px-2 py-2 align-middle tabular-nums text-muted-foreground">
          {(job.imported_rows ?? 0).toLocaleString()}
        </td>
        <td className="hidden xl:table-cell px-2 py-2 align-middle tabular-nums text-destructive/90">
          {failureCount(job).toLocaleString()}
        </td>
        <td className="hidden lg:table-cell px-2 py-2 align-middle text-muted-foreground">
          {job.started_at ? formatShortDateTime(job.started_at) : '—'}
        </td>
        <td className="hidden xl:table-cell px-2 py-2 align-middle tabular-nums text-muted-foreground">{dur}</td>
        <td className="hidden lg:table-cell px-2 py-2 align-middle tabular-nums text-muted-foreground">
          {job.job_retry_count ?? 0}/{job.max_job_retries ?? 12}
        </td>
        <td className="w-24 px-2 py-2 align-middle text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" type="button" className="h-8 w-8 shrink-0" disabled={!busyIdle}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions for {job.file_name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSelect(job.id)}>
                Focus job
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canMutate || !busyIdle || job.status !== 'staged'}
                onClick={() => onQueue(job.id)}
              >
                Queue import
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canMutate || !busyIdle || job.status !== 'staged'}
                onClick={() => onQueueAndStart(job.id)}
              >
                Queue &amp; start
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMutate || !busyIdle} onClick={() => onRunChunks(job.id)}>
                Run processing
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canMutate || !busyIdle} onClick={() => onRetry(job.id)}>
                Retry failures
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={!canMutate || !busyIdle}
                onClick={() => onCancel(job.id)}
              >
                Cancel job
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-foreground/5 bg-muted/15">
          <td colSpan={10} className="px-4 py-3">
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <ImportJobStatusBadge status={job.status} />
                <span className="text-muted-foreground">
                  Rows {(job.total_rows ?? 0).toLocaleString()} · Imported {(job.imported_rows ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="xs" variant="outline" className="gap-1" onClick={() => void navigator.clipboard?.writeText(job.id)}>
                  <Copy className="size-3" />
                  Copy job id
                </Button>
              </div>
              <details className="rounded-lg border border-foreground/10 bg-background px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground">Execution stats</summary>
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                  {JSON.stringify(job.execution_stats ?? {}, null, 2)}
                </pre>
              </details>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Failure diagnostics</p>
                {failureLoading ? (
                  <p className="mt-1 text-muted-foreground">Loading…</p>
                ) : failureGroups && failureGroups.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {failureGroups.map((g) => (
                      <li key={g.error_message} className="flex justify-between gap-2 text-[11px]">
                        <span className="min-w-0 break-words text-foreground">{g.error_message}</span>
                        <span className="shrink-0 text-muted-foreground">×{g.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">No grouped failures loaded.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const Row = memo(RowImpl);

export function ImportHistoryTable({
  jobs,
  activeJobId,
  expandedJobIds,
  onToggleExpand,
  failureDiagByJob,
  failureDiagLoading,
  onEnsureFailureDiag,
  canMutate,
  busyIdle,
  onSelect,
  onQueue,
  onQueueAndStart,
  onRunChunks,
  onCancel,
  onRetry,
  hasMore,
  loading,
  onLoadMore,
}: ImportHistoryTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-sm">
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Import history</h3>
        <p className="text-xs text-muted-foreground">Recent jobs for your account. Actions respect server policies.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {jobs.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-foreground/10">
              <Square className="size-6 text-muted-foreground opacity-60" strokeWidth={1.25} />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-medium text-foreground">No imports yet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Stage a validated file to create your first job. It will appear here with live queue telemetry.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left text-xs" role="grid">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b border-foreground/10 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2">File</th>
                <th className="hidden lg:table-cell px-2 py-2">Status</th>
                <th className="hidden md:table-cell px-2 py-2">Total</th>
                <th className="hidden md:table-cell px-2 py-2">Imported</th>
                <th className="hidden xl:table-cell px-2 py-2">Failures</th>
                <th className="hidden lg:table-cell px-2 py-2">Started</th>
                <th className="hidden xl:table-cell px-2 py-2">Duration</th>
                <th className="hidden lg:table-cell px-2 py-2">Retries</th>
                <th className="w-24 px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <Row
                  key={job.id}
                  job={job}
                  active={activeJobId === job.id}
                  expanded={expandedJobIds.has(job.id)}
                  onToggleExpand={onToggleExpand}
                  failureGroups={failureDiagByJob[job.id]}
                  failureLoading={failureDiagLoading === job.id}
                  onEnsureFailureDiag={onEnsureFailureDiag}
                  canMutate={canMutate}
                  busyIdle={busyIdle}
                  onSelect={onSelect}
                  onQueue={onQueue}
                  onQueueAndStart={onQueueAndStart}
                  onRunChunks={onRunChunks}
                  onCancel={onCancel}
                  onRetry={onRetry}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {jobs.length > 0 ? (
        <div className="border-t border-border/60 px-4 py-3">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={!hasMore || loading} onClick={() => void onLoadMore()}>
            {loading ? 'Loading…' : hasMore ? 'Load more' : 'End of list'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
