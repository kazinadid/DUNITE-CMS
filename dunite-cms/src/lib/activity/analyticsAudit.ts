import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

type AnalyticsAuditAction =
  | 'analytics_sync_started'
  | 'analytics_sync_completed'
  | 'analytics_sync_failed'
  | 'analytics_manual_refresh'
  | 'analytics_token_expired'
  | 'analytics_exported'
  | 'analytics_viewed';

/**
 * Lightweight organization-scoped audits (never stores tokens/secrets/raw Graph bodies).
 */
export async function insertAnalyticsAuditLog(input: {
  userId: string;
  organizationId: string;
  actionType: AnalyticsAuditAction;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    await supabase.rpc('activity_logs_insert_safe', {
      p_user_id: input.userId,
      p_entity_type: 'organization',
      p_entity_id: input.organizationId,
      p_action_type: input.actionType,
      p_message: input.message,
      p_metadata: {
        ...input.metadata,
        organization_id: input.organizationId,
      },
    });
  } catch (err) {
    console.warn(
      '[analyticsAudit] skipped:',
      (err as Error).message,
    );
  }
}

export async function resolveOrganizationAuditUser(
  organizationId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', organizationId)
    .maybeSingle();

  const ownerId = data?.owner_id;
  return typeof ownerId === 'string' ? ownerId : null;
}
