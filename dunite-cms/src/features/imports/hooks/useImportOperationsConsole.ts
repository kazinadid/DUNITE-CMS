'use client';

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  cancelImportJobServerAction,
  enqueueImportJobServerAction,
  executeImportJobChunkServerAction,
  getImportFailureDiagnosticsServerAction,
  getImportJobChunkHistoryServerAction,
  listRecentImportJobsServerAction,
  requeueStaleImportJobsServerAction,
  retryFailedImportRowsServerAction,
  stageImportJobServerAction,
} from '@/app/actions/importJobsActions';

import { supabase } from '@/lib/supabaseClient';

import { getDefaultTimeZone } from '../lib/dates';
import { buildImportPreviewPayload } from '../preview/prepareImportPreview';
import type { ImportFailureGroup, ImportJobListItem, ImportStagingDiagnostics, NormalizedImportRow } from '../types';
import type { ImportJobChunkLog } from '../types';

const MAX_AUTO_CHUNKS = 40;
const PAGE_SIZE = 20;

export type ImportOpsBusy = 'idle' | 'staging' | 'executing' | 'loading' | 'recovering';

export interface UseImportOperationsConsoleArgs {
  canMutate: boolean;
  rows: NormalizedImportRow[];
  fileName: string | null;
  fileKind: 'csv' | 'xlsx' | null;
  workflowReady: boolean;
}

export interface UseImportOperationsConsoleResult {
  busy: ImportOpsBusy;
  lastToolbarAction: 'idle' | 'success' | 'error';
  activeJobId: string | null;
  setActiveJobId: Dispatch<SetStateAction<string | null>>;
  history: ImportJobListItem[];
  historyLoading: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;
  refreshHistory: (opts?: { quiet?: boolean }) => Promise<void>;
  stageSuccess: { jobId: string; stagedRows: number } | null;
  setStageSuccess: Dispatch<SetStateAction<{ jobId: string; stagedRows: number } | null>>;
  authClientUid: string | null;
  lastStagingDiag: ImportStagingDiagnostics | null;
  expandedJobIds: ReadonlySet<string>;
  toggleExpandJob: (id: string) => void;
  failureDiagByJob: Record<string, ImportFailureGroup[]>;
  failureDiagLoading: string | null;
  ensureFailureDiag: (jobId: string) => Promise<void>;
  chunkHistoryByJob: Record<string, ImportJobChunkLog[]>;
  chunkHistoryLoading: string | null;
  ensureChunkHistory: (jobId: string) => Promise<void>;
  handleStage: () => Promise<void>;
  handleEnqueue: (jobId: string) => Promise<void>;
  handleQueueAndStart: (jobId: string) => Promise<void>;
  handleRunChunks: (jobId: string) => Promise<void>;
  handleCancel: (jobId: string) => Promise<void>;
  handleRetryFailed: (jobId: string) => Promise<void>;
  handleRecoverWorkers: () => Promise<void>;
  pollRefreshRef: MutableRefObject<() => void>;
}

export function useImportOperationsConsole({
  canMutate,
  rows,
  fileName,
  fileKind,
  workflowReady,
}: UseImportOperationsConsoleArgs): UseImportOperationsConsoleResult {
  const [busy, setBusy] = useState<ImportOpsBusy>('idle');
  const [lastToolbarAction, setLastToolbarAction] = useState<'idle' | 'success' | 'error'>('idle');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportJobListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [stageSuccess, setStageSuccess] = useState<{ jobId: string; stagedRows: number } | null>(null);
  const [authClientUid, setAuthClientUid] = useState<string | null>(null);
  const [lastStagingDiag, setLastStagingDiag] = useState<ImportStagingDiagnostics | null>(null);
  const [expandedJobIds, setExpandedJobIds] = useState<ReadonlySet<string>>(new Set());
  const [failureDiagByJob, setFailureDiagByJob] = useState<Record<string, ImportFailureGroup[]>>({});
  const [failureDiagLoading, setFailureDiagLoading] = useState<string | null>(null);
  const [chunkHistoryByJob, setChunkHistoryByJob] = useState<Record<string, ImportJobChunkLog[]>>({});
  const [chunkHistoryLoading, setChunkHistoryLoading] = useState<string | null>(null);

  const pollRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAuthClientUid(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshHistory = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet ?? false;
    if (!quiet) {
      setBusy((b) => (b === 'executing' || b === 'staging' || b === 'recovering' ? b : 'loading'));
      setHistoryLoading(true);
    }
    try {
      const res = await listRecentImportJobsServerAction(PAGE_SIZE, 0);
      if (res.ok && res.jobs) {
        setHistory(res.jobs);
        setHasMoreHistory(res.jobs.length >= PAGE_SIZE);
      }
    } catch {
      toast.error('Could not refresh import history.');
    } finally {
      setHistoryLoading(false);
      if (!quiet) setBusy('idle');
    }
  }, []);

  const loadMoreHistory = useCallback(async () => {
    if (!hasMoreHistory || historyLoading) return;
    setHistoryLoading(true);
    try {
      const res = await listRecentImportJobsServerAction(PAGE_SIZE, history.length);
      if (res.ok && res.jobs) {
        setHistory((h) => {
          const seen = new Set(h.map((x) => x.id));
          const next = [...h];
          for (const j of res.jobs ?? []) {
            if (!seen.has(j.id)) next.push(j);
          }
          return next;
        });
        setHasMoreHistory((res.jobs?.length ?? 0) >= PAGE_SIZE);
      }
    } catch {
      toast.error('Could not load more imports.');
    } finally {
      setHistoryLoading(false);
    }
  }, [hasMoreHistory, historyLoading, history.length]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshHistory({ quiet: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshHistory]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (lastToolbarAction !== 'idle') {
      t = setTimeout(() => setLastToolbarAction('idle'), 2400);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [lastToolbarAction]);

  const toggleExpandJob = useCallback((id: string) => {
    setExpandedJobIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const ensureFailureDiag = useCallback(
    async (jobId: string) => {
      if (failureDiagByJob[jobId]) return;
      setFailureDiagLoading(jobId);
      try {
        const res = await getImportFailureDiagnosticsServerAction(jobId);
        if (res.ok) setFailureDiagByJob((p) => ({ ...p, [jobId]: res.groups ?? [] }));
        else toast.error(res.message ?? 'Diagnostics failed');
      } finally {
        setFailureDiagLoading(null);
      }
    },
    [failureDiagByJob],
  );

  const ensureChunkHistory = useCallback(
    async (jobId: string) => {
      if (chunkHistoryByJob[jobId]) return;
      setChunkHistoryLoading(jobId);
      try {
        const res = await getImportJobChunkHistoryServerAction(jobId, 40, 0);
        if (res.ok) setChunkHistoryByJob((p) => ({ ...p, [jobId]: res.chunks ?? [] }));
        else toast.error(res.message ?? 'Chunk history failed');
      } finally {
        setChunkHistoryLoading(null);
      }
    },
    [chunkHistoryByJob],
  );

  const handleStage = useCallback(async () => {
    if (!canMutate || !workflowReady || rows.length === 0) return;
    setBusy('staging');
    setLastStagingDiag(null);
    setLastToolbarAction('idle');
    try {
      const tz = getDefaultTimeZone();
      const payload = buildImportPreviewPayload(rows, tz);
      const res = await stageImportJobServerAction(payload, {
        fileName: fileName ?? 'import.csv',
        fileType: fileKind,
      });
      if (!res.ok) {
        const diag = res.diagnostics ?? null;
        if (diag) setLastStagingDiag(diag);
        toast.error(res.message ?? 'Staging failed.');
        setLastToolbarAction('error');
        return;
      }
      setLastStagingDiag(null);
      toast.success(`Staged ${res.stagedRows.toLocaleString()} row(s).`);
      setLastToolbarAction('success');
      setStageSuccess({ jobId: res.jobId, stagedRows: res.stagedRows });
      setActiveJobId(res.jobId);
      await refreshHistory({ quiet: true });
    } finally {
      setBusy('idle');
    }
  }, [canMutate, workflowReady, rows, fileName, fileKind, refreshHistory]);

  const runExecuteChunksInternal = useCallback(async (jobId: string) => {
    setBusy('executing');
    try {
      let finished = false;
      for (let i = 0; i < MAX_AUTO_CHUNKS && !finished; i++) {
        const chunk = await executeImportJobChunkServerAction(jobId);
        if (!chunk.ok) {
          toast.error(chunk.message ?? 'Execution failed.');
          setLastToolbarAction('error');
          break;
        }
        if (chunk.finished) {
          finished = true;
          toast.success(`Import finished (${chunk.jobStatus ?? 'done'}).`);
          setLastToolbarAction('success');
        }
      }
      if (!finished) toast.message('Large import: run processing again to continue.');
      await refreshHistory({ quiet: true });
      pollRefreshRef.current();
    } finally {
      setBusy('idle');
    }
  }, [refreshHistory]);

  const handleEnqueue = useCallback(
    async (jobId: string) => {
      setBusy('loading');
      try {
        const res = await enqueueImportJobServerAction(jobId);
        if (!res.ok) {
          toast.error(res.message ?? 'Queue failed.');
          setLastToolbarAction('error');
          return;
        }
        toast.success('Import queued.');
        setLastToolbarAction('success');
        await refreshHistory({ quiet: true });
        pollRefreshRef.current();
      } finally {
        setBusy('idle');
      }
    },
    [refreshHistory],
  );

  const handleQueueAndStart = useCallback(
    async (jobId: string) => {
      setBusy('loading');
      try {
        const enq = await enqueueImportJobServerAction(jobId);
        if (!enq.ok) {
          toast.error(enq.message ?? 'Queue failed.');
          setLastToolbarAction('error');
          return;
        }
        toast.success('Queued — starting processing.');
        setLastToolbarAction('success');
        await refreshHistory({ quiet: true });
      } finally {
        setBusy('idle');
      }
      await runExecuteChunksInternal(jobId);
    },
    [refreshHistory, runExecuteChunksInternal],
  );

  const handleCancel = useCallback(
    async (jobId: string) => {
      setBusy('loading');
      try {
        const res = await cancelImportJobServerAction(jobId);
        if (!res.ok) toast.error(res.message ?? 'Cancel failed.');
        else {
          toast.message('Import cancelled.');
          setActiveJobId((cur) => (cur === jobId ? null : cur));
          await refreshHistory({ quiet: true });
          pollRefreshRef.current();
        }
      } finally {
        setBusy('idle');
      }
    },
    [refreshHistory],
  );

  const handleRetryFailed = useCallback(
    async (jobId: string) => {
      setBusy('loading');
      try {
        const res = await retryFailedImportRowsServerAction(jobId);
        if (!res.ok) toast.error(res.message ?? 'Retry prep failed.');
        else {
          toast.success(`Retry prepared (${res.reset ?? 0} row reset).`);
          setActiveJobId(jobId);
          await refreshHistory({ quiet: true });
          pollRefreshRef.current();
        }
      } finally {
        setBusy('idle');
      }
    },
    [refreshHistory],
  );

  const handleRecoverWorkers = useCallback(async () => {
    setBusy('recovering');
    try {
      const res = await requeueStaleImportJobsServerAction(30);
      if (!res.ok) {
        toast.error(res.message ?? 'Recover failed.');
        setLastToolbarAction('error');
        return;
      }
      toast.success(`Recover complete (${res.requeued ?? 0} job(s)).`);
      setLastToolbarAction('success');
      await refreshHistory({ quiet: true });
    } finally {
      setBusy('idle');
    }
  }, [refreshHistory]);

  return {
    busy,
    lastToolbarAction,
    activeJobId,
    setActiveJobId,
    history,
    historyLoading,
    hasMoreHistory,
    loadMoreHistory,
    refreshHistory,
    stageSuccess,
    setStageSuccess,
    authClientUid,
    lastStagingDiag,
    expandedJobIds,
    toggleExpandJob,
    failureDiagByJob,
    failureDiagLoading,
    ensureFailureDiag,
    chunkHistoryByJob,
    chunkHistoryLoading,
    ensureChunkHistory,
    handleStage,
    handleEnqueue,
    handleQueueAndStart,
    handleRunChunks: runExecuteChunksInternal,
    handleCancel,
    handleRetryFailed,
    handleRecoverWorkers,
    pollRefreshRef,
  };
}
