'use client';

import { useContext } from 'react';

import { AuthContext } from '@/features/auth/components/AuthProvider';
import type { AuthContextValue } from '@/features/auth/types';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
