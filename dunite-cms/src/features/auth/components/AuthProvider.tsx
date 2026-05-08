'use client';

import { createContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabaseClient';

import {
  signInWithPassword,
  signOut as signOutService,
  signUpWithPassword,
  mapAuthError,
} from '../services/authService';
import type { AuthContextValue, SignUpInput, SignUpResult } from '../types';

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: Session | null;
}) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [loading, setLoading] = useState(initialSession === null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      async signIn(email, password) {
        const { error } = await signInWithPassword(email, password);
        return { error: error ? mapAuthError(error.message) : null };
      },
      async signUp(input: SignUpInput): Promise<SignUpResult> {
        const result = await signUpWithPassword(
          input.email,
          input.password,
          input.fullName,
        );
        if (result.error) {
          return { error: result.error, hasSession: false };
        }
        return { error: null, hasSession: result.hasSession };
      },
      async signOut() {
        await signOutService();
      },
    }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
