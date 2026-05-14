'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getImportJobProgressServerAction } from '@/app/actions/importJobsActions';

import type { ImportJobProgressPayload } from '@/features/imports/types';

const POLL_MS = 2800;

/**
 * Polling-safe progress for import execution (ready for future Realtime swap).
 */
export function useImportJobProgressPoll(jobId: string | null, enabled: boolean) {
  const [progress, setProgress] = useState<ImportJobProgressPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await getImportJobProgressServerAction(jobId);
      if (res.ok && res.progress) setProgress(res.progress);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !enabled) {
      setProgress(null);
      return;
    }
    void refresh();
    timerRef.current = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [jobId, enabled, refresh]);

  return { progress, loading, refresh };
}
