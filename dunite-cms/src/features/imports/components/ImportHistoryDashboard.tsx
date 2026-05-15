'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import {
  listRecentImportJobsServerAction,
  requeueStaleImportJobsServerAction,
} from '@/app/actions/importJobsActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isAdmin } from '@/lib/rbac';

import type { Role } from '@/features/auth/types';

import { useImportJobProgressPoll } from '../hooks/useImportJobProgressPoll';
import type { ImportJobListItem } from '../types';

type HistoryTab = 'all' | 'active' | 'done' | 'attention';

function statusTone(status: string): string {
  if (status === 'completed') return 'text-emerald-600';
  if (status === 'partial_success') return 'text-amber-600';
  if (status === 'failed' || status === 'cancelled') return 'text-destructive';
  if (status === 'queued') return 'text-sky-600';
  if (status === 'processing') return 'text-violet-600';
  return 'text-muted-foreground';
}

function miniProgressPct(job: ImportJobListItem): number {
  const total = job.total_rows ?? 0;
  if (total <= 0) return 0;
  const imported = job.imported_rows ?? 0;
  return Math.min(100, Math.round((imported / total) * 100));
}

export interface ImportHistoryDashboardProps {
  role: Role;
  className?: string;
}

export function ImportHistoryDashboard({ role, className }: ImportHistoryDashboardProps) {
  const [tab, setTab] = useState<HistoryTab>('all');
  const [jobs, setJobs] = useState<ImportJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const admin = isAdmin(role);

  const selectedStatus = useMemo(
    () => jobs.find((j) => j.id === selectedId)?.status,
    [jobs, selectedId],
  );

  const { progress, refresh } = useImportJobProgressPoll(
    selectedId,
    !!selectedId,
    selectedStatus,
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listRecentImportJobsServerAction(80);
    setLoading(false);
    if (res.ok && res.jobs) setJobs(res.jobs);
    else if (!res.ok) toast.error(res.message ?? 'Could not load import history.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === 'all') return jobs;
    if (tab === 'active') {
      return jobs.filter((j) => ['staging', 'staged', 'queued', 'processing', 'validating'].includes(j.status));
    }
    if (tab === 'done') {
      return jobs.filter((j) => ['completed', 'partial_success', 'failed', 'cancelled'].includes(j.status));
    }
    return jobs.filter((j) =>
      ['failed', 'partial_success', 'cancelled'].includes(j.status),
    );
  }, [jobs, tab]);

  const handleStaleRecover = async () => {
    const res = await requeueStaleImportJobsServerAction(30);
    if (!res.ok) toast.error(res.message ?? 'Recovery failed');
    else toast.success(`Re-queued ${res.requeued ?? 0} stale import job(s).`);
    await load();
  };

  return (
    <Card className={cn('border-foreground/10', className)}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Import history</CardTitle>
            <CardDescription>
              Queue positions, execution retries, and terminal outcomes — optimized for polling (no giant payloads).
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Refresh
            </Button>
            {admin && (
              <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={() => void handleStaleRecover()}>
                <ShieldAlert className="size-4" />
                Recover stale workers
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['done', 'Completed'],
              ['attention', 'Needs attention'],
            ] as const
          ).map(([k, label]) => (
            <Button
              key={k}
              type="button"
              size="xs"
              variant={tab === k ? 'default' : 'outline'}
              onClick={() => setTab(k)}
            >
              {label}
            </Button>
          ))}
        </div>

        {selectedId && progress && (
          <div className="rounded-lg border border-foreground/10 bg-muted/20 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{progress.file_name}</p>
              <Button type="button" variant="ghost" size="xs" onClick={() => void refresh()}>
                Refresh row
              </Button>
            </div>
            <p className="mt-1 text-muted-foreground">
              {progress.status}
              {progress.queue_position != null ? ` · queue ~${progress.queue_position}` : ''} · retries{' '}
              {progress.job_retry_count}/{progress.max_job_retries} · chunks{' '}
              {progress.execution_stats.chunks_completed ?? 0}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progress.progress_pct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Pending importable: {progress.pending_importable} · In flight: {progress.importing_rows} · Imported:{' '}
              {progress.imported_rows}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">File</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Rows</th>
                <th className="py-2 pr-2">Imported</th>
                <th className="py-2 pr-2">Retries</th>
                <th className="py-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No imports in this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((j) => {
                  const pct = miniProgressPct(j);
                  const selected = selectedId === j.id;
                  return (
                    <tr
                      key={j.id}
                      className={cn(
                        'border-b border-foreground/5 hover:bg-muted/40',
                        selected && 'bg-muted/50',
                      )}
                    >
                      <td className="max-w-[220px] py-2 pr-2">
                        <button
                          type="button"
                          className="truncate text-left font-medium text-foreground underline-offset-2 hover:underline"
                          onClick={() => setSelectedId(selected ? null : j.id)}
                        >
                          {j.file_name}
                        </button>
                      </td>
                      <td className={cn('py-2 pr-2 font-medium', statusTone(j.status))}>{j.status}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{j.total_rows ?? 0}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{j.imported_rows ?? 0}</td>
                      <td className="py-2 pr-2 text-muted-foreground">
                        {j.job_retry_count ?? 0}/{j.max_job_retries ?? 12}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{pct}%</span>
                          {['failed', 'partial_success'].includes(j.status) && (
                            <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-hidden />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
