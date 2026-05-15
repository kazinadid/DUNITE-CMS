'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPreviewPayload } from '@/features/imports/preview/prepareImportPreview';
import { executeImportJobChunkAction } from '@/features/imports/server/executeImportJobChunk';
import {
  cancelImportJobAction,
  listRecentImportJobsAction,
  retryFailedImportRowsAction,
} from '@/features/imports/server/importJobLifecycleActions';
import { stageImportJobAction } from '@/features/imports/server/stageImportJob';

export async function stageImportJobServerAction(
  payload: ImportPreviewPayload,
  fileMeta: { fileName: string; fileType: string | null },
) {
  const res = await stageImportJobAction(payload, fileMeta);
  if (res.ok) {
    revalidatePath('/dashboard/imports');
    revalidatePath('/dashboard/activity');
  }
  return res;
}

export async function executeImportJobChunkServerAction(jobId: string) {
  const res = await executeImportJobChunkAction(jobId);
  if (res.ok) {
    revalidatePath('/dashboard/imports');
    if (res.finished) {
      revalidatePath('/dashboard/posts');
      revalidatePath('/dashboard/activity');
    }
  }
  return res;
}

export async function cancelImportJobServerAction(jobId: string) {
  const res = await cancelImportJobAction(jobId);
  if (res.ok) {
    revalidatePath('/dashboard/imports');
    revalidatePath('/dashboard/activity');
  }
  return res;
}

export async function listRecentImportJobsServerAction(limit?: number) {
  return listRecentImportJobsAction(limit);
}

export async function retryFailedImportRowsServerAction(jobId: string) {
  const res = await retryFailedImportRowsAction(jobId);
  if (res.ok) {
    revalidatePath('/dashboard/imports');
  }
  return res;
}
