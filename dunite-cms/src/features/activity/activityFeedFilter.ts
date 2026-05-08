import type { ActivityLog } from './types';

const SKIP_META_EVENT = new Set(['jobs_rebuilt', 'jobs_reset', 'jobs_skipped']);

export function filterConcisePublishing(rows: ActivityLog[]): ActivityLog[] {
  return rows.filter((r) => {
    if (!r.action_type.startsWith('publishing.')) return true;
    if (r.metadata?.source !== 'publishing_logs') return true;
    const et = typeof r.metadata.event_type === 'string' ? r.metadata.event_type : '';
    if (SKIP_META_EVENT.has(et)) return false;
    return true;
  });
}
