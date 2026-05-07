import { supabase } from '@/lib/supabaseClient';

import { DEFAULT_ROLE } from '../types';

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { data, error };
  }

  // Create the matching row in `public.users`. We `upsert` with
  // `ignoreDuplicates` so this is a no-op if a DB trigger has already
  // populated the row, keeping the call idempotent.
  if (data.user) {
    const { error: insertError } = await supabase.from('users').upsert(
      {
        id: data.user.id,
        email: data.user.email,
        role: DEFAULT_ROLE,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

    if (insertError) {
      // Don't block the signup flow on profile creation; surface a warning
      // so it can be retried (e.g. via the auth state change listener on
      // first sign-in if email confirmation is enabled).
      console.warn('[auth] failed to create users row:', insertError.message);
    }
  }

  return { data, error: null };
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
