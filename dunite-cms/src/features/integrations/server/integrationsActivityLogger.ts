// ============================================================================
// DUNITE CMS — Integration activity logger
// ============================================================================
// Safe wrapper around activity_logs for OAuth / social account events.
// Never logs raw tokens, secrets, or sensitive credentials.
// ============================================================================

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

interface LogOAuthActivityInput {
  userId: string;
  organizationId: string;
  actionType: string;
  message: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Appends a social account activity log entry.
 * Skips silently on error (logging must never block the OAuth flow).
 */
export async function logOAuthActivity(input: LogOAuthActivityInput): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();

    await supabase.rpc('activity_logs_insert_safe', {
      p_user_id:     input.userId,
      p_entity_type: 'social_account',
      p_entity_id:   input.accountId ?? null,
      p_action_type: input.actionType,
      p_message:     input.message,
      p_metadata: {
        ...input.metadata,
        organization_id: input.organizationId,
      },
    });
  } catch (err) {
    // Non-critical: log warning but never throw — logging must not block auth flows.
    console.warn('[integrationsActivityLogger] Failed to write activity log:', (err as Error).message);
  }
}
