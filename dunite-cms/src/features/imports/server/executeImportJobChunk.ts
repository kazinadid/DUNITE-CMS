import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getImportActor } from './importAuth';
import { resolveImportChunkSize } from './importQueueConstants';
import { executeOneImportChunk } from './execution/workerExecutor';

export interface ExecuteImportChunkResult {
  ok: boolean;
  message?: string;
  finished: boolean;
  jobStatus?: string;
  /** Rows touched in this invocation */
  processedThisChunk: number;
  chunkId?: string;
}

/**
 * Queue-safe chunk processor: claims rows via `import_rows_claim_execution_batch`
 * (SKIP LOCKED + transient `importing` state), creates posts idempotently, and
 * updates rolling `execution_stats` for polling UIs.
 */
export async function executeImportJobChunkAction(jobId: string): Promise<ExecuteImportChunkResult> {
  const supabase = await createSupabaseServerClient();
  let user;
  let role;
  try {
    ({ user, role } = await getImportActor(supabase));
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unauthorized.',
      finished: true,
      processedThisChunk: 0,
    };
  }

  const chunkSize = resolveImportChunkSize();

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, status, uploaded_by')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr || !job) {
    return { ok: false, message: jobErr?.message ?? 'Job not found.', finished: true, processedThisChunk: 0 };
  }

  if ((job.uploaded_by as string) !== user.id && role !== 'admin') {
    return { ok: false, message: 'Forbidden.', finished: true, processedThisChunk: 0 };
  }

  if (job.status === 'staged') {
    return {
      ok: false,
      message: 'Queue this import before running execution chunks.',
      finished: true,
      jobStatus: 'staged',
      processedThisChunk: 0,
    };
  }

  if (!['queued', 'processing', 'retrying'].includes(job.status as string)) {
    return {
      ok: false,
      message: `Job is not executable in status «${job.status}».`,
      finished: true,
      jobStatus: job.status as string,
      processedThisChunk: 0,
    };
  }

  const workerId = `dashboard:${user.id}`;
  const res = await executeOneImportChunk({
    supabase,
    workerId,
    trigger: 'dashboard',
    queueName: 'dashboard',
    jobId,
    ownerUserIdOverride: String(job.uploaded_by),
    chunkSize,
    includeDevStack: process.env.NODE_ENV === 'development',
  });

  return {
    ok: res.ok,
    message: res.message,
    finished: res.finished,
    jobStatus: res.jobStatus,
    processedThisChunk: res.processedThisChunk,
    chunkId: res.chunkId,
  };
}
