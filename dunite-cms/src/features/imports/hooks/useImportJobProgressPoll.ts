'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getImportJobProgressServerAction } from '@/app/actions/importJobsActions';

import type { ImportJobProgressPayload } from '@/features/imports/types';

import { isImportJobTerminalStatus, shouldPollImportJobProgress } from '../lib/importJobStatusPresentation';

const BASE_DELAY_MS = 2600;
const MAX_DELAY_MS = 28_000;

function fingerprint(p: ImportJobProgressPayload | null): string {
  if (!p) return '';
  return [
    p.status,
    p.imported_rows,
    p.pending_importable,
    p.importing_rows,
    p.progress_pct,
    p.job_retry_count,
    p.execution_stats?.last_heartbeat_at,
  ].join(':');
}

/**
 * Lightweight polling with exponential backoff when snapshots are unchanged.
 * Polls when the job may still progress; slows down on idle snapshots and stops on terminal statuses.
 */
export function useImportJobProgressPoll(
  jobId: string | null,
  enabled: boolean,
  listStatusHint: string | null | undefined,
) {
  const [progress, setProgress] = useState<ImportJobProgressPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY_MS);
  const stableTicksRef = useRef(0);
  const lastFpRef = useRef('');
  const progressRef = useRef<ImportJobProgressPayload | null>(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async (): Promise<ImportJobProgressPayload | null> => {
    if (!jobId) return null;
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const res = await getImportJobProgressServerAction(jobId);
      if (res.ok && res.progress) {
        setProgress(res.progress);
        return res.progress;
      }
      return null;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [jobId]);

  const scheduleNextRef = useRef<() => void>(() => {});

  const scheduleNext = useCallback(() => {
    clearTimer();
    const j = jobId;
    if (!j || !enabled) return;

    const effectiveStatus = progressRef.current?.status ?? listStatusHint ?? '';
    if (isImportJobTerminalStatus(effectiveStatus)) {
      return;
    }
    if (!shouldPollImportJobProgress(effectiveStatus) && progressRef.current != null) {
      return;
    }

    const delay = delayRef.current;
    timerRef.current = globalThis.setTimeout(async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        scheduleNextRef.current();
        return;
      }

      const before = lastFpRef.current;
      const next = await refresh();

      if (!next) {
        delayRef.current = Math.min(MAX_DELAY_MS, Math.round(delayRef.current * 1.35));
        scheduleNextRef.current();
        return;
      }

      const after = fingerprint(next);
      lastFpRef.current = after;

      if (isImportJobTerminalStatus(next.status)) {
        return;
      }

      if (after === before && before !== '') {
        stableTicksRef.current += 1;
        if (stableTicksRef.current >= 2) {
          delayRef.current = Math.min(MAX_DELAY_MS, Math.round(delayRef.current * 1.3));
        }
      } else {
        stableTicksRef.current = 0;
        delayRef.current = BASE_DELAY_MS;
      }

      scheduleNextRef.current();
    }, delay);
  }, [jobId, enabled, clearTimer, refresh, listStatusHint]);

  useEffect(() => {
    scheduleNextRef.current = scheduleNext;
  }, [scheduleNext]);

  const kick = useCallback(() => {
    delayRef.current = BASE_DELAY_MS;
    stableTicksRef.current = 0;
    clearTimer();
    void refresh().then((p) => {
      if (p) lastFpRef.current = fingerprint(p);
      scheduleNextRef.current();
    });
  }, [clearTimer, refresh]);

  useEffect(() => {
    delayRef.current = BASE_DELAY_MS;
    stableTicksRef.current = 0;
    lastFpRef.current = '';
    clearTimer();

    if (!jobId || !enabled) {
      queueMicrotask(() => setProgress(null));
      return () => clearTimer();
    }

    void refresh().then((p) => {
      if (p) lastFpRef.current = fingerprint(p);
      scheduleNextRef.current();
    });

    return () => clearTimer();
  }, [jobId, enabled, clearTimer, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && jobId && enabled) {
        kick();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [jobId, enabled, kick]);

  const effectiveStatus = progress?.status ?? listStatusHint ?? '';

  return {
    progress,
    loading,
    refresh: kick,
    isPolling: Boolean(jobId && enabled && !isImportJobTerminalStatus(effectiveStatus)),
  };
}
