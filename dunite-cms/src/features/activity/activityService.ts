import { supabase } from '@/lib/supabaseClient';

import { ACTIVITY_FEED_SELECT, mapActivityRow } from './queries';
import type { ActivityListParams } from './types';
import type { ActivityLog, RawActivityRow } from './types';

const HOUSEKEEPING_ACTIONS = new Set<string>(['post.publish_timestamps_updated']);

function escapeIlikeFragment(s: string) {
  return s.replace(/[%_\\]/g, '\\$&');
}

/** Global feed query with filters — ordered newest first before range. */
function buildFilteredQuery(filters: ActivityListParams) {
  let q = supabase.from('activity_logs').select(ACTIVITY_FEED_SELECT, {
    count: 'exact',
  });

  const qtext = filters.query?.trim();
  if (qtext) {
    const safe = escapeIlikeFragment(qtext);
    q = q.or(`message.ilike.%${safe}%,action_type.ilike.%${safe}%`);
  }

  if (filters.userId) {
    q = q.eq('user_id', filters.userId);
  }

  if (filters.actionType?.trim()) {
    q = q.ilike('action_type', `%${escapeIlikeFragment(filters.actionType.trim())}%`);
  }

  if (filters.entityType?.trim()) {
    q = q.eq('entity_type', filters.entityType.trim());
  }

  if (filters.entityId?.trim()) {
    q = q.eq('entity_id', filters.entityId.trim());
  }

  if (filters.createdFromIso) {
    q = q.gte('created_at', filters.createdFromIso);
  }

  if (filters.createdToIso) {
    q = q.lte('created_at', filters.createdToIso);
  }

  return q.order('created_at', { ascending: false });
}

function stripNoise(rows: ActivityLog[]): ActivityLog[] {
  return rows.filter((r) => !HOUSEKEEPING_ACTIONS.has(r.action_type));
}

/**
 * Workspace-wide activity feed (paginated).
 * Rows are constrained by Supabase RLS — never trust implicit client scopes.
 */
export async function listActivityPage(
  params: ActivityListParams,
): Promise<{ entries: ActivityLog[]; total: number }> {
  const safePageSize = Math.min(80, Math.max(1, params.pageSize));
  const page        = Math.max(1, params.page);
  const offset      = (page - 1) * safePageSize;

  let query = buildFilteredQuery({ ...params, page, pageSize: safePageSize });
  query = query.range(offset, offset + safePageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as RawActivityRow[]).map(mapActivityRow);
  rows     = stripNoise(rows);

  return {
    entries: rows,
    total: count ?? rows.length,
  };
}

/** Post-centric audit stream — direct post rows + platforms + attaching media rows. */
export async function listActivityForPost(postId: string): Promise<ActivityLog[]> {
  const select = ACTIVITY_FEED_SELECT;

  const [postRows, platformRows, mediaRows] = await Promise.all([
    supabase
      .from('activity_logs')
      .select(select)
      .eq('entity_type', 'post')
      .eq('entity_id', postId)
      .order('created_at', { ascending: false }),
    supabase
      .from('activity_logs')
      .select(select)
      .eq('entity_type', 'post_platform')
      .eq('entity_id', postId)
      .order('created_at', { ascending: false }),
    supabase
      .from('activity_logs')
      .select(select)
      .eq('entity_type', 'media')
      .contains('metadata', { post_id: postId })
      .order('created_at', { ascending: false }),
  ]);

  const err = postRows.error || platformRows.error || mediaRows.error;
  if (err) throw err;

  const merged = [...(postRows.data ?? []), ...(platformRows.data ?? []), ...(mediaRows.data ?? [])] as unknown as RawActivityRow[];

  const byId = new Map<string, ActivityLog>();
  for (const raw of merged) {
    const row = mapActivityRow(raw);
    byId.set(row.id, row);
  }

  let rows = [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  rows = stripNoise(rows);

  return rows.slice(0, 200);
}
