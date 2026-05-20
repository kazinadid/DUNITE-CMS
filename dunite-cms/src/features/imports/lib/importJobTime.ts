import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { formatLocalDateTime } from '@/lib/date';

dayjs.extend(relativeTime);

/** Compact "May 20, 19:10" in the viewer's local zone. */
export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatLocalDateTime(iso, {
    weekday: undefined,
    year:    undefined,
    month:   'short',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
  });
}

export function formatRelativeFromNow(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function deriveJobDurationMs(job: {
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}): number | null {
  const end = job.completed_at ? dayjs(job.completed_at).valueOf() : Date.now();
  const start = job.started_at
    ? dayjs(job.started_at).valueOf()
    : job.created_at
      ? dayjs(job.created_at).valueOf()
      : null;
  if (start == null) return null;
  return Math.max(0, end - start);
}

export function estimateRemainingSeconds(params: {
  pendingRows: number;
  rowsPerSecond: number | null;
}): number | null {
  const { pendingRows, rowsPerSecond } = params;
  if (pendingRows <= 0) return 0;
  if (rowsPerSecond == null || rowsPerSecond <= 0) return null;
  return pendingRows / rowsPerSecond;
}
