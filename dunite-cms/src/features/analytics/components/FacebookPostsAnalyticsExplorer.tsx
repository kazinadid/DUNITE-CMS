'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

type Row = {
  postId?: string | null;
  metricDate?: string | null;
  impressions: number;
  reach: number;
  engagements: number;
  engagement_rate?: number | null;
  ctr?: number | null;
  synced_at?: string | null;
};

type ApiEnvelope = {
  ok: boolean;
  data?: { items: Row[]; page: number; pageSize: number; total: number; sort?: string };
  error?: string;
};

function utcRange(days: number): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - Math.max(days, 1));
  return {
    from: start.toISOString().slice(0, 10),
    to:   end.toISOString().slice(0, 10),
  };
}

export function FacebookPostsAnalyticsExplorer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ApiEnvelope['data']>();

  const [from, setFrom] = useState(() => utcRange(13).from);
  const [to, setTo] = useState(() => utcRange(13).to);
  const [page, setPage] = useState(1);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        from,
        to,
        page: `${page}`,
        pageSize: `${pageSize}`,
        sort: 'engagements',
      });
      const res = await fetch(`/api/analytics/facebook/posts?${q.toString()}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as ApiEnvelope;
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? 'Failed loading post analytics.');
      }
      setPayload(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed loading post analytics.');
      setPayload(undefined);
    } finally {
      setLoading(false);
    }
  }, [from, page, pageSize, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(() => {
    if (!payload) return 1;
    return Math.max(1, Math.ceil(payload.total / pageSize));
  }, [payload, pageSize]);

  return (
    <div className="px-4 pb-10 pt-6 md:px-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Post analytics detail</h1>
        <p className="text-sm text-muted-foreground">
          Latest synced snapshot per outbound Facebook post filtered by UTC window.
        </p>
      </div>

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Window</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium">
            From
            <input
              type="date"
              value={from}
              onChange={(ev) => {
                setPage(1);
                setFrom(ev.target.value);
              }}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            To
            <input
              type="date"
              value={to}
              onChange={(ev) => {
                setPage(1);
                setTo(ev.target.value);
              }}
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
            />
          </label>
          <div className="flex items-end justify-start gap-2">
            <Button type="button" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-4 text-xs text-muted-foreground">
          <span>
            Page {payload?.page ?? page} / {totalPages} ({payload?.total ?? 0} posts)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </CardFooter>
      </Card>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <Card className="bg-white shadow-sm ring-foreground/15">
        <CardContent className="overflow-x-auto p-0 pt-4">
          {loading && !payload ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-10 animate-pulse rounded-md bg-gray-100" />
              ))}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-3 pl-4 pr-2 font-medium">Post</th>
                  <th className="py-3 pr-2 font-medium">Engagements</th>
                  <th className="py-3 pr-2 font-medium">Reach</th>
                  <th className="py-3 pr-2 font-medium">CTR</th>
                  <th className="py-3 pr-2 font-medium">Snap date</th>
                </tr>
              </thead>
              <tbody>
                {(payload?.items ?? []).map((row) => (
                  <tr key={`${row.postId}-${row.metricDate}`} className="border-b border-gray-100">
                    <td className="py-3 pl-4 pr-2 font-medium">
                      {row.postId ? (
                        <Link
                          className="text-[#7A0000] hover:underline"
                          href={`/dashboard/posts/${row.postId}/edit`}
                        >
                          Open post →
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 pr-2">{Intl.NumberFormat().format(row.engagements)}</td>
                    <td className="py-3 pr-2">{Intl.NumberFormat().format(row.reach)}</td>
                    <td className="py-3 pr-2">{row.ctr != null ? `${row.ctr.toFixed(2)}%` : '—'}</td>
                    <td className="py-3 pr-2 text-xs text-muted-foreground">
                      {row.metricDate ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
