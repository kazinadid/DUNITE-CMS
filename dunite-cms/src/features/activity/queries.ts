import type { ActivityLog, RawActivityRow } from './types';

/** Minimal relational payload — feed/timeline renders from this bundle. */
export const ACTIVITY_FEED_SELECT = `
  id,
  user_id,
  entity_type,
  entity_id,
  action_type,
  message,
  metadata,
  created_at,
  actor:users(id, name, email)
` as const;

export function mapActivityRow(raw: RawActivityRow): ActivityLog {
  const a = raw.actor as
    | RawActivityRow['actor']
    | RawActivityRow['actor'][]
    | null
    | undefined;
  const actor = Array.isArray(a) ? (a[0] ?? null) : a ?? null;

  return {
    id:          raw.id,
    user_id:     raw.user_id,
    entity_type: raw.entity_type as ActivityLog['entity_type'],
    entity_id:   raw.entity_id,
    action_type: raw.action_type,
    message:     raw.message,
    metadata:    raw.metadata ?? null,
    created_at:  raw.created_at,
    actor,
  };
}
