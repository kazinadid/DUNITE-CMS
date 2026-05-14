'use client';

import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ArrowDown, ArrowUp, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  bulkArchiveImportJobsServerAction,
  bulkCancelImportJobsServerAction,
  bulkRetryImportJobsServerAction,
  listImportJobsPagedServerAction,
} from '@/app/actions/importJobsActions';
import { Button } from '@/components/ui/button';
import { canRunBatchImport, isAdmin } from '@/lib/rbac';
import type { Role } from '@/features/auth';

import { useVirtualListWindow } from '../hooks/useVirtualListWindow';
import type { ImportJobSortKey, ImportJobTableRow } from '../types';

import { ImportStatusBadge } from './importStatusBadge';
import { QueueHealthIndicator } from './queueHealthIndicator';

dayjs.extend(relativeTime);

function fmtDuration(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export function ImportManagementTable({ role }: { role: Role }) {
  const canMutate = canRunBatchImport(role);
  const admin = isAdmin(role);

  const [rows, setRows] = useState<ImportJobTableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [status, setStatus] = useState<string>('all');
  const [sortKey, setSortKey] = useState<ImportJobSortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [hideArchived, setHideArchived] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const useVirtual = rows.length > 36;
  const v = useVirtualListWindow(rows, 44, { overscan: 8 });
  const displayRows = useVirtual ? v.slice : rows;
  const colSpan = canMutate ? 14 : 13;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listImportJobsPagedServerAction({
      page,
      pageSize,
      status: status === 'all' ? undefined : status,
      sortKey,
      sortDir,
      search: search.trim() || undefined,
      hideArchived,
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setRows(res.rows);
    setTotal(res.total);
  }, [page, pageSize, status, sortKey, sortDir, search, hideArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (key: ImportJobSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'file_name' ? 'asc' : 'desc');
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const runBulk = async (kind: 'cancel' | 'archive' | 'retry') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = kind === 'cancel' ? 'cancel' : kind === 'archive' ? 'archive' : 'retry failed rows for';
    if (!window.confirm(`${label} ${ids.length} import(s)? This respects role limits and job eligibility.`)) return;
    setBulkBusy(true);
    try {
      if (kind === 'cancel') {
        const r = await bulkCancelImportJobsServerAction(ids);
        if (!r.ok) toast.error(r.message ?? 'Bulk cancel failed');
        else toast.success(`Cancelled ${r.cancelled ?? 0} job(s).`);
      } else if (kind === 'archive') {
        const r = await bulkArchiveImportJobsServerAction(ids);
        if (!r.ok) toast.error(r.message ?? 'Bulk archive failed');
        else toast.success(`Archived ${r.archived ?? 0} job(s).`);
      } else {
        const r = await bulkRetryImportJobsServerAction(ids);
        if (!r.ok) toast.error(r.message ?? 'Bulk retry failed');
        else {
          toast.success(`Re-queued retries for ${r.retried ?? 0} job(s).`);
          if (r.failures?.length) toast.message(r.failures.slice(0, 5).join('\n'));
        }
      }
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const sortIcon = (key: ImportJobSortKey) =>
    sortKey === key ? sortDir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(searchDraft);
                  setPage(1);
                }
              }}
              placeholder="Search file name…"
              aria-label="Search imports by file name"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => { setSearch(searchDraft); setPage(1); }}>
            Search
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideArchived}
              onChange={(e) => {
                setHideArchived(e.target.checked);
                setPage(1);
              }}
            />
            Hide archived
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by status"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="processing">Processing</option>
            <option value="staged">Staged</option>
            <option value="staging">Staging</option>
            <option value="completed">Completed</option>
            <option value="partial_success">Partial success</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {canMutate && selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-muted/40 px-3 py-2 text-sm"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="text-muted-foreground">{selected.size} selected</span>
          <Button type="button" size="xs" variant="outline" disabled={bulkBusy} onClick={() => void runBulk('cancel')}>
            Cancel
          </Button>
          <Button type="button" size="xs" variant="outline" disabled={bulkBusy} onClick={() => void runBulk('archive')}>
            Archive
          </Button>
          <Button type="button" size="xs" disabled={bulkBusy} onClick={() => void runBulk('retry')}>
            Retry failures
          </Button>
        </div>
      )}

      <div
        ref={v.onContainerRef}
        className="relative max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-foreground/10"
        tabIndex={0}
        role="region"
        aria-label="Import jobs table"
      >
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {canMutate && (
                <th className="w-10 px-2 py-2">
                  <span className="sr-only">Select all</span>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all rows" />
                </th>
              )}
              <th className="px-2 py-2">Details</th>
              <th className="px-2 py-2">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('file_name')}>
                  File {sortIcon('file_name')}
                </button>
              </th>
              <th className="px-2 py-2">Uploader</th>
              <th className="px-2 py-2">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('status')}>
                  Status {sortIcon('status')}
                </button>
              </th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('imported_rows')}>
                  Imported {sortIcon('imported_rows')}
                </button>
              </th>
              <th className="px-2 py-2 text-right">Invalid</th>
              <th className="px-2 py-2 text-right">Dup</th>
              <th className="px-2 py-2 text-right">Retries</th>
              <th className="px-2 py-2 text-right">Queue</th>
              <th className="px-2 py-2">
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('created_at')}>
                  Created {sortIcon('created_at')}
                </button>
              </th>
              <th className="px-2 py-2">Duration</th>
              <th className="px-2 py-2">Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {useVirtual && (
              <tr aria-hidden style={{ height: v.offsetTop }}>
                <td colSpan={colSpan} />
              </tr>
            )}
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-6 animate-spin" aria-label="Loading" />
                </td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No imports match these filters.
                </td>
              </tr>
            ) : (
              displayRows.map((r) => (
                <tr key={r.id} className="border-b border-foreground/5 hover:bg-muted/40">
                  {canMutate && (
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.file_name}`}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 align-middle">
                    <Link className="text-xs font-medium text-primary underline-offset-2 hover:underline" href={`/dashboard/imports/${r.id}`}>
                      Open
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1.5 align-middle font-medium" title={r.file_name}>
                    {r.file_name}
                  </td>
                  <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground">{r.uploader_label}</td>
                  <td className="px-2 py-1.5 align-middle">
                    <ImportStatusBadge status={r.status} compact />
                  </td>
                  <td className="px-2 py-1.5 text-right align-middle tabular-nums">{r.total_rows ?? 0}</td>
                  <td className="px-2 py-1.5 text-right align-middle tabular-nums">{r.imported_rows ?? 0}</td>
                  <td className="px-2 py-1.5 text-right align-middle tabular-nums">{r.invalid_rows ?? 0}</td>
                  <td className="px-2 py-1.5 text-right align-middle tabular-nums">{r.duplicate_rows ?? 0}</td>
                  <td className="px-2 py-1.5 text-right align-middle tabular-nums text-xs">
                    {r.job_retry_count ?? 0}/{r.max_job_retries ?? 12}
                  </td>
                  <td className="px-2 py-1.5 text-right align-middle text-xs tabular-nums text-muted-foreground">
                    {r.queue_position ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 align-middle text-xs text-muted-foreground whitespace-nowrap">
                    {dayjs(r.created_at).format('MMM D, HH:mm')}
                  </td>
                  <td className="px-2 py-1.5 align-middle text-xs tabular-nums text-muted-foreground">{fmtDuration(r.duration_ms)}</td>
                  <td className="px-2 py-1.5 align-middle">
                    <QueueHealthIndicator status={r.status} heartbeatIso={r.processing_heartbeat_at} />
                  </td>
                </tr>
              ))
            )}
            {useVirtual && !loading && rows.length > 0 && (
              <tr aria-hidden style={{ height: v.offsetBottom }}>
                <td colSpan={colSpan} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Page {page} / {totalPages} · {total} job{total === 1 ? '' : 's'}
          {admin ? ' · admin scope' : ''}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="xs" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
