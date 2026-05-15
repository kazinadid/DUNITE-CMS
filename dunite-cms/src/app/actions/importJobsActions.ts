'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPreviewPayload } from '@/features/imports/preview/prepareImportPreview';
import { enqueueImportJobAction } from '@/features/imports/server/enqueueImportJob';
import { executeImportJobChunkAction } from '@/features/imports/server/executeImportJobChunk';
import { getImportFailureDiagnosticsAction } from '@/features/imports/server/importFailureDiagnostics';
import {
  cancelImportJobAction,
  listRecentImportJobsAction,
  retryFailedImportRowsAction,
} from '@/features/imports/server/importJobLifecycleActions';
import { getImportJobProgressAction } from '@/features/imports/server/importJobProgress';
import {
  bulkArchiveImportJobsAction,
  bulkCancelImportJobsAction,
  bulkRetryImportJobsAction,
  getImportJobChunkHistoryAction,
  getImportJobDetailAction,
  getImportJobErrorReportAction,
  getImportJobStatusCountsAction,
  getImportOperationsSummaryAction,
  listImportJobsPagedAction,
  type ListImportJobsPagedParams,
} from '@/features/imports/server/importOperationsService';
import { requeueStaleImportJobsAdminAction } from '@/features/imports/server/importQueueAdminActions';
import { stageImportJobAction } from '@/features/imports/server/stageImportJob';

function revalidateImportSurfaces(jobId?: string) {
  revalidatePath('/dashboard/imports');
  revalidatePath('/dashboard/imports/operations');
  if (jobId) revalidatePath(`/dashboard/imports/${jobId}`);
  revalidatePath('/dashboard/activity');
}

export async function stageImportJobServerAction(
  payload: ImportPreviewPayload,
  fileMeta: { fileName: string; fileType: string | null },
) {
  const res = await stageImportJobAction(payload, fileMeta);
  if (res.ok) {
    revalidateImportSurfaces(res.jobId);
  }
  return res;
}

export async function enqueueImportJobServerAction(jobId: string) {
  const res = await enqueueImportJobAction(jobId);
  if (res.ok) {
    revalidateImportSurfaces(jobId);
  }
  return res;
}

export async function executeImportJobChunkServerAction(jobId: string) {
  const res = await executeImportJobChunkAction(jobId);
  if (res.ok) {
    revalidateImportSurfaces(jobId);
    if (res.finished) {
      revalidatePath('/dashboard/posts');
    }
  }
  return res;
}

export async function cancelImportJobServerAction(jobId: string) {
  const res = await cancelImportJobAction(jobId);
  if (res.ok) {
    revalidateImportSurfaces(jobId);
  }
  return res;
}

export async function listRecentImportJobsServerAction(limit?: number, offset?: number) {
  return listRecentImportJobsAction(limit, offset);
}

export async function retryFailedImportRowsServerAction(jobId: string) {
  const res = await retryFailedImportRowsAction(jobId);
  if (res.ok) {
    revalidateImportSurfaces(jobId);
  }
  return res;
}

export async function getImportJobProgressServerAction(jobId: string) {
  return getImportJobProgressAction(jobId);
}

export async function getImportFailureDiagnosticsServerAction(jobId: string) {
  return getImportFailureDiagnosticsAction(jobId);
}

export async function requeueStaleImportJobsServerAction(heartbeatMinutes?: number) {
  const res = await requeueStaleImportJobsAdminAction(heartbeatMinutes);
  if (res.ok) {
    revalidateImportSurfaces();
  }
  return res;
}

export async function listImportJobsPagedServerAction(params: ListImportJobsPagedParams) {
  return listImportJobsPagedAction(params);
}

export async function getImportOperationsSummaryServerAction() {
  return getImportOperationsSummaryAction();
}

export async function getImportJobStatusCountsServerAction() {
  return getImportJobStatusCountsAction();
}

export async function bulkCancelImportJobsServerAction(jobIds: string[]) {
  const res = await bulkCancelImportJobsAction(jobIds);
  if (res.ok) {
    revalidateImportSurfaces();
  }
  return res;
}

export async function bulkArchiveImportJobsServerAction(jobIds: string[]) {
  const res = await bulkArchiveImportJobsAction(jobIds);
  if (res.ok) {
    revalidateImportSurfaces();
  }
  return res;
}

export async function bulkRetryImportJobsServerAction(jobIds: string[]) {
  const res = await bulkRetryImportJobsAction(jobIds);
  if (res.ok) {
    revalidateImportSurfaces();
  }
  return res;
}

export async function getImportJobDetailServerAction(jobId: string) {
  return getImportJobDetailAction(jobId);
}

export async function getImportJobChunkHistoryServerAction(jobId: string, limit?: number, offset?: number) {
  return getImportJobChunkHistoryAction(jobId, { limit, offset });
}

export async function getImportJobErrorReportServerAction(jobId: string) {
  return getImportJobErrorReportAction(jobId);
}
