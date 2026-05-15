'use client';

import { ExternalLink, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  getImportJobStatusCountsServerAction,
  getImportOperationsSummaryServerAction,
  requeueStaleImportJobsServerAction,
} from '@/app/actions/importJobsActions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/features/dashboard/components/PageHeader';
import type { Role } from '@/features/auth';
import { canRunBatchImport, isAdmin } from '@/lib/rbac';

import type { ImportOperationsSummary } from '../types';

import { ImportManagementTable } from './ImportManagementTable';
import { ImportMetricsCards } from './ImportMetricsCards';
import { ImportStatusBadge } from './importStatusBadge';

export function ImportOperationsDashboard({ role }: { role: Role }) {
  const canMutate = canRunBatchImport(role);
  const admin = isAdmin(role);
  const [summary, setSummary] = useState<ImportOperationsSummary | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      getImportOperationsSummaryServerAction(),
      getImportJobStatusCountsServerAction(),
    ]);
    setLoading(false);
    if (s.ok && s.summary) setSummary(s.summary);
    else if (!s.ok) toast.error(s.message);
    if (c.ok && c.counts) setCounts(c.counts);
    else if (!c.ok) toast.error(c.message);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleStale = async () => {
    const res = await requeueStaleImportJobsServerAction(30);
    if (!res.ok) toast.error(res.message ?? 'Recovery failed');
    else toast.success(`Re-queued ${res.requeued ?? 0} stale job(s).`);
    await refresh();
  };

  return (
    <div className="mx-auto w-full max-w-[min(100vw-2rem,1360px)] space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Import operations"
          description="Queue health, execution metrics, and enterprise-grade import management. Polling-safe; ready for realtime workers."
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refresh()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
          {admin && (
            <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={() => void handleStale()}>
              <ShieldAlert className="size-4" />
              Recover stale workers
            </Button>
          )}
          {canMutate && (
            <Button type="button" variant="default" size="sm" asChild>
              <Link href="/dashboard/imports">New import</Link>
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/dashboard/activity" className="gap-1">
              Activity <ExternalLink className="size-3.5 opacity-60" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {['queued', 'processing', 'retrying', 'failed', 'completed'].map((st) => (
          <Card key={st} className="border-foreground/10">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium capitalize">{st.replace(/_/g, ' ')}</CardTitle>
                <ImportStatusBadge status={st} compact />
              </div>
              <CardDescription className="text-2xl font-semibold tabular-nums text-foreground">
                {counts?.[st] ?? (loading ? '…' : 0)}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <ImportMetricsCards summary={summary} counts={counts} loading={loading} />

      <Card className="border-foreground/10">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="text-base">Import jobs</CardTitle>
          <CardDescription>
            {canMutate
              ? 'Sort, filter, and run bulk actions on jobs you can manage (RLS enforced server-side).'
              : 'Read-only operational visibility — RLS limits rows to your workspace rules.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ImportManagementTable role={role} />
        </CardContent>
      </Card>
    </div>
  );
}
