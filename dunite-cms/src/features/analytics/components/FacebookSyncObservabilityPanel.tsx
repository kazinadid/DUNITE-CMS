'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const NO_PLATFORM_COPY =
  'No connected platforms found. Please connect a platform first before syncing.';

type SyncApiPayload = {
  capabilities: { export: boolean; manageSync: boolean };
  facebook: {
    connected: boolean;
    connectedPagesCount: number;
  };
  queueJobs: Record<string, unknown>[];
  syncLogs: Record<string, unknown>[];
  postSyncIndicators: Record<string, unknown>[];
};

type ApiEnvelope = {
  ok: boolean;
  data?: SyncApiPayload;
  error?: string;
};

type WorkspaceSyncPayload = {
  mode: 'workspace';
  stats: {
    attempted: number;
    succeeded: number;
    failures: number;
    apiCallsApprox: number;
  };
};

type TargetedSyncPayload = {
  mode: 'targeted';
  okCount: number;
  errors: string[];
};

export function FacebookSyncObservabilityPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [payload, setPayload] = useState<SyncApiPayload>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        limitQueue: '35',
        limitLogs: '25',
      });
      const res = await fetch(`/api/analytics/facebook/sync-status?${q.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as ApiEnvelope;
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? 'Sync status unavailable.');
      }
      setPayload(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync status unavailable.');
      setPayload(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleManualSync() {
    if (!payload?.capabilities.manageSync || !payload.facebook?.connected || busy || loading)
      return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/social/facebook/analytics/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        data?: WorkspaceSyncPayload | TargetedSyncPayload;
      };

      if (!res.ok || !json.ok) {
        if (json.code === 'facebook_not_connected') {
          setError(NO_PLATFORM_COPY);
        } else if (typeof json.error === 'string') {
          setError(json.error.trim() || 'Sync could not complete. Please try again.');
        } else {
          setError('Sync could not complete. Please try again.');
        }
        await load();
        return;
      }

      if (json.data?.mode === 'workspace') {
        const st = json.data.stats;
        setSuccess(
          `Facebook analytics sync ran successfully (${st.succeeded}/${st.attempted} succeeded, API calls ~${st.apiCallsApprox}).`,
        );
      } else if (json.data?.mode === 'targeted') {
        const n = json.data.okCount ?? 0;
        setSuccess(`Synced ${n} post${n === 1 ? '' : 's'} successfully.`);
      } else {
        setSuccess('Facebook analytics sync completed successfully.');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync could not complete. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const anomalies =
    payload?.postSyncIndicators?.filter((row) =>
      typeof row.fb_analytics_sync_status === 'string'
        ? ['stale', 'failed', 'syncing'].includes(row.fb_analytics_sync_status as string)
        : false,
    ).length ?? 0;

  const manageSync = Boolean(payload?.capabilities.manageSync);
  const facebookConnected = Boolean(payload?.facebook?.connected);

  return (
    <div className="space-y-6 px-4 pb-10 pt-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">Sync observability</h1>
          <p className="text-sm text-muted-foreground">
            Queue backlog, Postgres sync telemetry, and post-level statuses. Tokens never ship to browsers.
            Only Facebook Pages are supported today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy || loading} asChild>
            <Link href="/dashboard/integrations">Connect a platform</Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={
              loading || busy || !manageSync || !facebookConnected || !payload
            }
            onClick={() => void handleManualSync()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Manual enqueue
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setSuccess(null);
              void load();
            }}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reload
          </Button>
        </div>
      </div>

      {!manageSync ? (
        <p className="text-xs text-muted-foreground">
          Workspace administrators can enqueue jobs; editors and viewers inspect health only.
        </p>
      ) : null}

      {manageSync && payload && !loading && !facebookConnected ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-950 shadow-sm">
          <p className="font-semibold">{NO_PLATFORM_COPY}</p>
          <p className="mt-1 text-xs opacity-90">
            Connect a Facebook Page under Integrations, then enqueue insights sync from here.
          </p>
          <Button className="mt-3" size="sm" asChild>
            <Link href="/dashboard/integrations">Go to Integrations</Link>
          </Button>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          {success}
        </div>
      ) : null}

      {anomalies > 12 ? (
        <div className="rounded-xl border border-amber-400/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {anomalies} posts recently flagged or stuck — inspect CRON coverage and integrations.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-white shadow-sm ring-foreground/15 lg:col-span-3">
          <CardHeader className="pb-1">
            <CardTitle className="text-lg">Queue snapshot</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto text-xs">
            {loading && !payload ? (
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
            ) : (
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted/40 px-4 py-3">
                {JSON.stringify(payload?.queueJobs ?? [], null, 2)}
              </pre>
            )}
          </CardContent>
          <CardFooter className="text-[11px] text-muted-foreground">
            Rows respect org RLS; workers claim via SECURITY DEFINER RPC with SKIP LOCKED.
          </CardFooter>
        </Card>

        <Card className="bg-white shadow-sm ring-foreground/15 lg:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-lg">Post sync lifecycle sample</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {loading && !payload ? (
              <div className="h-44 animate-pulse rounded-xl bg-muted" />
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">CMS post</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Last successful sync</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload?.postSyncIndicators ?? []).map((row) => (
                    <tr key={String(row.id)} className="border-b border-gray-100">
                      <td className="py-2">
                        <Link
                          href={`/dashboard/posts/${String(row.id)}/edit`}
                          className="text-[#7A0000] hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                      <td className="py-2 capitalize">{String(row.fb_analytics_sync_status ?? '—')}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {row.fb_analytics_last_synced_at
                          ? new Date(String(row.fb_analytics_last_synced_at)).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm ring-foreground/15">
          <CardHeader className="pb-1">
            <CardTitle className="text-base leading-tight">
              Recent analytics_sync_logs
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[340px] overflow-auto text-xs">
            {loading && !payload ? (
              <div className="h-44 animate-pulse rounded-xl bg-muted" />
            ) : (
              <pre>{JSON.stringify(payload?.syncLogs ?? [], null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
