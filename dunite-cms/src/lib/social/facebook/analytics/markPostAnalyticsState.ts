import 'server-only';

import {
  insertAnalyticsAuditLog,
  resolveOrganizationAuditUser,
} from '@/lib/activity/analyticsAudit';
import { updatePostFbAnalyticsColumns } from '@/lib/social/facebook/analyticsDb';

export type PostFbAnalyticsLifecycleStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'stale'
  | null;

export async function markPostAnalyticsState(opts: {
  postId: string;
  lastSyncedAt: string | null;
  syncingStartedAt?: string | null;
  syncStatus: PostFbAnalyticsLifecycleStatus;
}): Promise<void> {
  await updatePostFbAnalyticsColumns(opts);
}

export async function auditFacebookTokenExpiredIfNeeded(
  organizationId: string,
  graphCode?: number,
): Promise<void> {
  if (graphCode !== 190 && graphCode !== 102) return;
  const actor = await resolveOrganizationAuditUser(organizationId);
  if (!actor) return;
  await insertAnalyticsAuditLog({
    userId: actor,
    organizationId,
    actionType: 'analytics_token_expired',
    message:    'Facebook Page access token is invalid or expired — reconnect required.',
    metadata:   { graph_code: graphCode },
  });
}
