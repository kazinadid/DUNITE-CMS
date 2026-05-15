import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Role } from '@/features/auth/types';
import { canRunBatchImport } from '@/lib/rbac';

export function assertImportOperatorRole(role: Role | null | undefined): void {
  if (!canRunBatchImport(role)) {
    throw new Error('You do not have permission to run bulk imports.');
  }
}

export async function getImportActor(supabase: SupabaseClient): Promise<{ user: User; role: Role }> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('Not authenticated.');
  }
  const { data: profile, error: pErr } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (pErr || !profile?.role) {
    throw new Error('Unable to resolve user role.');
  }
  const role = profile.role as Role;
  assertImportOperatorRole(role);
  return { user, role };
}
