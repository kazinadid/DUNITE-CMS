'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

export function LogoutButton({
  className,
  children = 'Sign out',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (submitting) return;
    setSubmitting(true);
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={submitting}
      className={className}
    >
      {submitting ? 'Signing out…' : children}
    </Button>
  );
}
