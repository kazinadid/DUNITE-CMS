'use client';

import { ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useRole } from '@/hooks/useRole';
import { canWrite } from '@/lib/rbac';

interface RoleGuardProps {
  children: React.ReactNode;
  /**
   * When true the component redirects to `fallback` instead of rendering
   * an inline denied screen.  Prefer this for full-page route protection.
   */
  redirect?: boolean;
  /** Destination when access is denied.  Defaults to '/dashboard'. */
  fallback?: string;
}

/**
 * Client-side route / section guard.
 *
 * - While the role is loading → spinner
 * - Viewer role + redirect=true → push to `fallback`
 * - Viewer role + redirect=false → inline "Access denied" screen
 * - Editor / Admin → render children
 */
export function RoleGuard({
  children,
  redirect = false,
  fallback = '/dashboard',
}: RoleGuardProps) {
  const { role, loading } = useRole();
  const router = useRouter();

  const denied = !loading && !canWrite(role);

  useEffect(() => {
    if (redirect && denied) {
      router.replace(fallback);
    }
  }, [redirect, denied, router, fallback]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <span
          aria-label="Loading…"
          className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700"
        />
      </div>
    );
  }

  if (denied) {
    if (redirect) return null;
    return <AccessDeniedScreen />;
  }

  return <>{children}</>;
}

function AccessDeniedScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <ShieldOff size={20} className="text-gray-400" aria-hidden />
      </span>

      <div>
        <p className="text-sm font-semibold text-gray-900">Access denied</p>
        <p className="mt-1 text-sm text-gray-500">
          Editor or admin permissions are required to view this page.
        </p>
      </div>
    </div>
  );
}
