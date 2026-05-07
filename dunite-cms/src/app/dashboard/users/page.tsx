import { requireAdmin } from '@/features/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role } from '@/features/auth';

import { UsersTable, type UserRow } from './UsersTable';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  // Server-side guard — non-admins are bounced to /dashboard before any
  // data is fetched.  RLS makes the SELECT below safe even if this check
  // is bypassed, but we keep it for fast UX.
  const auth = await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false });

  const users: UserRow[] = (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    created_at: u.created_at ?? null,
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Users
        </h1>
        <p className="text-sm text-gray-500">
          Manage team members and their access levels.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Failed to load users: {error.message}
        </div>
      )}

      <UsersTable initialUsers={users} currentUserId={auth.user.id} />
    </div>
  );
}
