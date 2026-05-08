import { supabase } from '@/lib/supabaseClient';

import { DEFAULT_ROLE } from '../types';

/** User-friendly copy for common Supabase auth error strings (no secrets). */
export function mapAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('already registered') || m.includes('user already')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Invalid email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  return raw;
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Registers a new user via Supabase Auth and aligns `public.users`.
 * `DEFAULT_ROLE` (viewer) is always used — never admin.
 * Trigger `handle_new_auth_user` may insert first; upsert merges `name` + role safely.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
): Promise<{ error: string | null; hasSession: boolean }> {
  const trimmedName = fullName.trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: trimmedName,
      },
    },
  });

  if (error) {
    return { error: mapAuthError(error.message), hasSession: false };
  }

  const hasSession = Boolean(data.session);

  if (data.user) {
    const { error: upsertError } = await supabase.from('users').upsert(
      {
        id:    data.user.id,
        email: data.user.email ?? email,
        name:  trimmedName || null,
        role:  DEFAULT_ROLE,
      },
      { onConflict: 'id' },
    );

    if (upsertError) {
      console.warn('[auth] users upsert after sign-up:', upsertError.message);
    }
  }

  return { error: null, hasSession };
}

/** Sends Supabase password recovery email (client-only origin for redirect). */
export async function requestPasswordReset(
  email: string,
): Promise<{ error: string | null }> {
  if (typeof window === 'undefined') {
    return { error: 'This action is only available in the browser.' };
  }
  const redirectTo = `${window.location.origin}/login?reset=complete`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  return { error: error ? mapAuthError(error.message) : null };
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  return supabase.auth.getSession();
}

export async function getUser() {
  return supabase.auth.getUser();
}
