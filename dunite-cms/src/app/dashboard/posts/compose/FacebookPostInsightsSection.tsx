'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { PostInsights } from '@/lib/social/facebook/insights/types';
import { Button } from '@/components/ui/button';
import { formatLocalDateTime } from '@/lib/date';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ApiShape = {
  ok: boolean;
  data?: {
    hasFacebookPost: boolean;
    post: {
      id?: string;
      contentPreview?: string;
      publishedAtIso?: string | null;
      status?: string;
      fbSyncStatus?: string | null;
      fbLastSyncedAt?: string | null;
    };
    insights?: PostInsights;
  };
  error?: string;
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? 'pending';
  const tone =
    s === 'synced'
      ? 'bg-emerald-100 text-emerald-800'
      : s === 'syncing'
        ? 'bg-amber-100 text-amber-900'
        : s === 'failed'
          ? 'bg-red-100 text-red-800'
          : s === 'stale'
            ? 'bg-slate-100 text-slate-800'
            : 'bg-gray-100 text-gray-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {s}
    </span>
  );
}

export function FacebookPostInsightsSection({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiShape['data'] | null>(null);
  const isMounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/facebook/analytics/post/${postId}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as ApiShape;
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? 'Unable to load insights');
      }
      if (isMounted.current) {
        setData(json.data);
      }
    } catch (e: unknown) {
      if (isMounted.current) {
        setError(e instanceof Error ? e.message : 'Unable to load insights');
        setData(null);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [postId]);

  useEffect(() => {
    isMounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data load on mount is a valid use case
    void load();
    return () => {
      isMounted.current = false;
    };
  }, [load]);

  const handleSyncSingle = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/social/facebook/analytics/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postIds: [postId] }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? 'Sync forbidden or failed.');
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [postId, load]);

  const chartPoints = useMemo(
    () =>
      (data?.insights?.series ?? []).map((p) => ({
        day: p.metricDate,
        engagements: p.engagements,
        impressions: p.impressions,
      })),
    [data?.insights?.series],
  );

  if (loading) {
    return (
      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Facebook insights…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-4 text-sm text-red-800">{error}</CardContent>
      </Card>
    );
  }

  if (!data?.hasFacebookPost) {
    return (
      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Facebook insights</CardTitle>
          <CardDescription>
            Publish this post to Facebook to unlock performance metrics.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ins = data.insights;

  return (
    <div className="space-y-4">
      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Facebook insights</CardTitle>
            <CardDescription>
              Securely aggregated metrics — tokens never leave the server.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.post.fbSyncStatus} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={syncing}
              onClick={handleSyncSingle}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh metrics
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Impressions</p>
            <p className="text-lg font-semibold">{ins?.impressions ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reach</p>
            <p className="text-lg font-semibold">{ins?.reach ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Engagements</p>
            <p className="text-lg font-semibold">{ins?.engagements ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reactions</p>
            <p className="text-lg font-semibold">{ins?.reactionsTotal ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Comments</p>
            <p className="text-lg font-semibold">{ins?.commentsCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shares</p>
            <p className="text-lg font-semibold">{ins?.sharesCount ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Clicks</p>
            <p className="text-lg font-semibold">{ins?.clicks ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Video views</p>
            <p className="text-lg font-semibold">{ins?.videoViews ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CTR</p>
            <p className="text-lg font-semibold">
              {ins?.ctr != null ? `${ins.ctr.toFixed(2)}%` : '—'}
            </p>
          </div>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Last synced:{' '}
          {data.post.fbLastSyncedAt
            ? formatLocalDateTime(data.post.fbLastSyncedAt)
            : 'Never'}
          {ins?.syncedAtIso ? ` • snapshot ${ins.metricDate}` : ''}
        </CardFooter>
      </Card>

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Engagement trend</CardTitle>
          <CardDescription>Daily rollup for this CMS post inside stored snapshots.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {chartPoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sync metrics to populate the chart history.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartPoints}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="engagements" stroke="#7A0000" dot={false} />
                <Line type="monotone" dataKey="impressions" stroke="#2563eb" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader>
          <CardTitle>Reaction mix</CardTitle>
          <CardDescription>Provided by Graph when granular reaction totals are available.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-3">
          {Object.keys(ins?.reactionsByType ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">No reaction breakdown stored yet.</p>
          ) : (
            Object.entries(ins?.reactionsByType ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-md border px-2 py-1">
                <span className="text-xs uppercase text-muted-foreground">{k}</span>
                <span className="font-medium">{v ?? 0}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
