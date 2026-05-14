import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

import { getImportListSession } from './importAuth';

import type { ImportFailureGroup } from '../types';

/**
 * Aggregated row-level execution failures for diagnostics UI (bounded payload).
 */
export async function getImportFailureDiagnosticsAction(
  jobId: string,
  limit = 25,
): Promise<{ ok: boolean; groups?: ImportFailureGroup[]; message?: string }> {
  const supabase = await createSupabaseServerClient();
  try {
    await getImportListSession(supabase);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unauthorized.' };
  }

  const { data: rows, error } = await supabase
    .from('import_rows')
    .select('error_message')
    .eq('import_job_id', jobId)
    .eq('processing_state', 'failed')
    .not('error_message', 'is', null)
    .limit(2000);

  if (error) return { ok: false, message: error.message };

  const map = new Map<string, number>();
  for (const r of rows ?? []) {
    const msg = String(r.error_message ?? '').trim() || '(no message)';
    map.set(msg, (map.get(msg) ?? 0) + 1);
  }

  const groups: ImportFailureGroup[] = [...map.entries()]
    .map(([error_message, count]) => ({ error_message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.min(80, Math.max(1, limit)));

  return { ok: true, groups };
}
