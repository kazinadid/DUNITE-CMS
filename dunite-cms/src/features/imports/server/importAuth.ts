import type { SupabaseClient, User } from '@supabase/supabase-js';

import type { Role } from '@/features/auth/types';
import { canRunBatchImport } from '@/lib/rbac';

export function assertImportOperatorRole(role: Role | null | undefined): void {
  if (!canRunBatchImport(role)) {
    throw new Error('You do not have permission to run bulk imports.');
  }
}

/**
 * Authenticated session for read-only import APIs (list, progress, diagnostics).
 * Viewers are allowed — RLS decides which rows are visible.
 */
export async function getImportListSession(supabase: SupabaseClient): Promise<{ user: User; role: Role }> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error('Not authenticated.');
  }
  if (!user.id) {
    throw new Error('Authenticated user is missing an id.');
  }
  const { data: profile, error: pErr } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (pErr || !profile?.role) {
    throw new Error('Unable to resolve user role.');
  }
  return { user, role: profile.role as Role };
}

export async function getImportActor(supabase: SupabaseClient): Promise<{ user: User; role: Role }> {
  const { user, role } = await getImportListSession(supabase);
  assertImportOperatorRole(role);
  return { user, role };
}
