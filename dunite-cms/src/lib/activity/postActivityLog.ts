import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';

/**
 * Inserts activity_logs rows for publishing / scheduling without exposing secrets.
 * Mirrors integrationsActivityLogger patterns (RPC security definer).
 */
export async function insertPostPublishActivityLog(params: {
  userId: string;
  postId: string;
  actionType: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    await supabase.rpc('activity_logs_insert_safe', {
      p_user_id: params.userId,
      p_entity_type: 'post',
      p_entity_id: params.postId,
      p_action_type: params.actionType,
      p_message: params.message,
      p_metadata: {
        ...params.metadata,
        post_id: params.postId,
      },
    });
  } catch (err) {
    console.warn(
      '[postActivityLog] skipped:',
      (err as Error).message,
    );
  }
}
