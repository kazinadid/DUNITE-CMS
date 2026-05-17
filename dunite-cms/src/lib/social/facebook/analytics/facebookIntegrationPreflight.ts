import 'server-only';

import { normalizeThrownError } from '@/lib/social/facebook/analytics/normalizeThrownError';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Connected Facebook Pages available for analytics (excludes OAuth mid-flow rows). */
export async function countConnectedFacebookAccounts(organizationId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from('social_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('platform', 'facebook')
    .neq('status', 'pending_selection');

  if (error) throw normalizeThrownError(error);

  return count ?? 0;
}
