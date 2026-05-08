'use client';

import type { ReactNode } from 'react';

import {
  authBackdropClass,
  authGridClass,
  authShellClass,
} from '@/features/auth/ui/authBrandClasses';
import { cn } from '@/lib/utils';

/**
 * Shared full-viewport shell for login, signup, forgot password — dark enterprise
 * backdrop with subtle grid; content sits in a centered column.
 */
export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn(authShellClass(), className)}>
      <div aria-hidden className={authBackdropClass()} />
      <div aria-hidden className={authGridClass()} />
      <div className="relative z-10 w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-2 duration-500">
        {children}
      </div>
    </main>
  );
}
