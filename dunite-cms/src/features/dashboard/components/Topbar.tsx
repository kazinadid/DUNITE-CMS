'use client';

import { LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

import { RoleBadge } from './RoleBadge';

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { role } = useRole();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-white/80 px-4 backdrop-blur-sm sm:px-6">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenSidebar}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p
            className="max-w-[200px] truncate text-sm font-medium leading-tight"
            title={user?.email ?? undefined}
          >
            {user?.email ?? '—'}
          </p>
        </div>

        <RoleBadge role={role} />

        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          disabled={signingOut}
          className="gap-1.5"
        >
          <LogOut className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">
            {signingOut ? 'Signing out…' : 'Sign out'}
          </span>
        </Button>
      </div>
    </header>
  );
}
