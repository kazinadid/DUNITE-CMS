'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Download } from 'lucide-react';
import Link from 'next/link';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DashboardAnalytics } from '@/lib/social/facebook/insights/types';
import type { Role } from '@/features/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { formatLocalDateTime } from '@/lib/date';

type Capabilities = {
  export: boolean;
  manageSync: boolean;
};

type ApiPayload = {
  dashboard: DashboardAnalytics;
  cached: boolean;
  capabilities: Capabilities;
};

function MetricCard(props: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="sm" className="bg-white shadow-sm ring-foreground/15">
      <CardHeader className="pb-1">
        <CardDescription>{props.title}</CardDescription>
      </CardHeader>
      <CardContent className="pt-1">
        <p className="text-2xl font-semibold tracking-tight text-[#7A0000]">
          {props.value}
        </p>
      </CardContent>
      {props.hint ? (
        <CardFooter className="pt-1 text-[11px] text-muted-foreground">
          {props.hint}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function formatInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function AnalyticsDashboardClient({
  userRole: _role,
}: {
  userRole: Role;
}) {
  void _role;

  const [loading, setLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState<string>('');

  const load = useCallback(
    async (opts?: { audit?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('from', from);
        params.set('to', to);
        if (accountId) params.set('socialAccountId', accountId);
        if (opts?.audit) params.set('auditView', '1');

        const res = await fetch(`/api/analytics/facebook/overview?${params.toString()}`, {
          credentials: 'include',
        });
        const json = (await res.json()) as {
          ok: boolean;
          data?: ApiPayload;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? 'Failed to load analytics');
        }
        setPayload(json.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
        setPayload(null);
      } finally {
        setLoading(false);
      }
    },
    [accountId, from, to],
  );

  const filtersKey = `${from}|${to}|${accountId}`;
  const auditLoggedRef = useRef(false);

  useEffect(() => {
    const shouldAudit = !auditLoggedRef.current;
    auditLoggedRef.current = true;
    void load({ audit: shouldAudit });
  }, [filtersKey, load]);

  const chartData = useMemo(
    () =>
      (payload?.dashboard.engagementSeries ?? []).map((p) => ({
        date: p.metricDate,
        engagements: p.engagements,
        impressions: p.impressions,
        reach: p.reach,
      })),
    [payload],
  );

  const exportHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set('format', 'csv');
    q.set('from', from);
    q.set('to', to);
    if (accountId) q.set('socialAccountId', accountId);
    return `/api/social/facebook/analytics/export?${q.toString()}`;
  }, [accountId, from, to]);

  const exportJsonHref = useMemo(() => {
    const q = new URLSearchParams();
    q.set('format', 'json');
    q.set('from', from);
    q.set('to', to);
    if (accountId) q.set('socialAccountId', accountId);
    return `/api/social/facebook/analytics/export?${q.toString()}`;
  }, [accountId, from, to]);

  async function handleSync() {
    if (!payload?.capabilities.manageSync) return;
    setSyncBusy(true);
    try {
      const res = await fetch('/api/social/facebook/analytics/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Sync failed');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  }

  const sum = payload?.dashboard.summary;

  return (
    <div className="px-4 py-6 md:px-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Facebook analytics</h1>
          <p className="text-sm text-gray-600">
            Organization-scoped performance for posts published through DUNITE.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payload?.capabilities.manageSync ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={syncBusy}
              onClick={() => void handleSync()}
            >
              {syncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
          ) : null}
          {payload?.capabilities.export ? (
            <>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={exportHref} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  CSV
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={exportJsonHref} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  JSON
                </a>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>UTC date range and optional Facebook Page filter.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 md:col-span-2">
            Page
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">All connected Pages</option>
              {(payload?.dashboard.accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply filters
          </Button>
        </CardFooter>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : null}

      {sum ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Total reach (workspace)" value={formatInt(sum.totalReach)} />
          <MetricCard title="Total impressions" value={formatInt(sum.totalImpressions)} />
          <MetricCard
            title="Engagement rate (avg/post)"
            value={sum.avgEngagementRate != null ? `${sum.avgEngagementRate.toFixed(2)}%` : '—'}
          />
          <MetricCard title="Tracked posts" value={`${sum.totalPostsWithData}`} />
          <MetricCard title="Total reactions" value={formatInt(sum.totalReactions)} />
          <MetricCard title="Total shares" value={formatInt(sum.totalShares)} />
          <MetricCard title="Total comments" value={formatInt(sum.totalComments)} />
          <MetricCard title="Total clicks" value={formatInt(sum.totalClicks)} />
        </div>
      ) : null}

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Engagement & impressions trends</CardTitle>
          <CardDescription>
            Summed telemetry per UTC day inside the filtered window.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No analytics snapshots yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="engagements" stroke="#7A0000" dot={false} />
                <Line type="monotone" dataKey="impressions" stroke="#2563eb" dot={false} />
                <Line type="monotone" dataKey="reach" stroke="#16a34a" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
        {payload?.cached ? (
          <CardFooter className="text-xs text-muted-foreground">Served from short-lived cache.</CardFooter>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-white shadow-sm ring-foreground/15">
          <CardHeader>
            <CardTitle>Top posts</CardTitle>
            <CardDescription>Ranked by latest engagement snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2">Post</th>
                  <th className="py-2 pr-2">Engagements</th>
                  <th className="py-2 pr-2">Reach</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.dashboard.topPosts ?? []).map((p) => (
                  <tr key={p.postId} className="border-b border-gray-100">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/dashboard/posts/${p.postId}/edit`}
                        className="text-[#7A0000] hover:underline"
                      >
                        {p.excerpt || '(No text)'}
                      </Link>
                    </td>
                    <td className="py-2 pr-2">{formatInt(p.engagements)}</td>
                    <td className="py-2 pr-2">{formatInt(p.reach)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm ring-foreground/15">
          <CardHeader>
            <CardTitle>Recent Facebook sends</CardTitle>
            <CardDescription>Latest posts with an external Facebook id.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2">Post</th>
                  <th className="py-2 pr-2">Published</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.dashboard.recentPublished ?? []).map((p) => (
                  <tr key={p.postId} className="border-b border-gray-100">
                    <td className="py-2 pr-2">
                      <Link
                        href={`/dashboard/posts/${p.postId}/edit`}
                        className="text-[#7A0000] hover:underline"
                      >
                        {p.excerpt || '(No text)'}
                      </Link>
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {p.publishedAtIso
                        ? formatLocalDateTime(p.publishedAtIso)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Failed Facebook attempts</CardTitle>
          <CardDescription>CMS posts currently in failed / retrying states.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-2">Post</th>
                <th className="py-2 pr-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.dashboard.failedPosts ?? []).length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-3 text-sm text-muted-foreground">
                    No failed posts in this organization.
                  </td>
                </tr>
              ) : (
                (payload?.dashboard.failedPosts ?? []).map((p) => (
                  <tr key={p.postId} className="border-b border-gray-100">
                    <td className="py-2 pr-2">{p.excerpt || '(No text)'}</td>
                    <td className="py-2 pr-2">
                      <Link
                        href={`/dashboard/posts/${p.postId}/edit`}
                        className="text-[#7A0000] hover:underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
