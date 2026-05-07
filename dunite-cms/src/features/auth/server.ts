import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canManageUsers, canWrite } from '@/lib/rbac';

import type { Role } from './types';

export interface AuthenticatedUser {
  user: User;
  role: Role;
  profile: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
  };
}

/**
 * Read the *verified* auth user from cookies and join the
 * matching `public.users` row to determine the role.
 *
 * Returns `null` when there is no logged-in user.
 *
 * Use this in every Server Component / Route Handler / Server Action
 * that needs role information — the value is always sourced from the DB.
 */
export async function getCurrentUserWithRole(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .single();

  if (error || !profile) return null;

  return {
    user,
    role: profile.role as Role,
    profile: profile as AuthenticatedUser['profile'],
  };
}

// ── Page-level guards (use inside RSCs) ──────────────────────────────────────

/** Redirect to /login if unauthenticated. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const auth = await getCurrentUserWithRole();
  if (!auth) redirect('/login');
  return auth;
}

/** Redirect to /dashboard if the user can't write content. */
export async function requireWriter(): Promise<AuthenticatedUser> {
  const auth = await requireUser();
  if (!canWrite(auth.role)) redirect('/dashboard');
  return auth;
}

/** Redirect to /dashboard if the user is not an admin. */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const auth = await requireUser();
  if (!canManageUsers(auth.role)) redirect('/dashboard');
  return auth;
}
