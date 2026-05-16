import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function requiredSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}

async function createSupabaseServerClientWithToken(accessToken?: string) {
  const cookieStore = await cookies();
  const { url, anonKey } = requiredSupabaseEnv();

  return createServerClient(
    url,
    anonKey,
    {
      ...(accessToken
        ? {
            global: {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          }
        : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll may be called from a Server Component where mutations are
            // not allowed. Safe to ignore — the proxy will refresh cookies.
          }
        },
      },
    },
  );
}

export async function createSupabaseServerClient() {
  return createSupabaseServerClientWithToken();
}

/**
 * Request-scoped Supabase client for Server Actions that must execute RLS-bound
 * SQL with the current user's JWT visible to PostgREST (`auth.uid()`).
 *
 * `getSession()` is used only to extract the cookie access token; `getUser()`
 * validates that token with Supabase Auth before the token is attached to DB
 * requests. This preserves RLS and avoids service-role/admin bypasses.
 */
export async function createAuthenticatedSupabaseServerClient() {
  const cookieClient = await createSupabaseServerClientWithToken();
  const {
    data: { session },
    error: sessionError,
  } = await cookieClient.auth.getSession();
  const {
    data: { user },
    error: userError,
  } = await cookieClient.auth.getUser();

  if (sessionError || userError || !session?.access_token || !user?.id) {
    throw new Error('Not authenticated.');
  }

  const supabase = await createSupabaseServerClientWithToken(session.access_token);

  return {
    supabase,
    session,
    user,
  };
}

/**
 * Supabase client using the service-role key.
 * Use ONLY in trusted server contexts: API routes, background jobs, cron handlers.
 * Never expose this client to client components or return its data directly to users.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.'
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });
}
