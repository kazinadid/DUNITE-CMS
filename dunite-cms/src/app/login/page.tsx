import { Suspense } from 'react';

import { AuthBrand } from '@/features/auth/components/AuthBrand';
import { AuthShell } from '@/features/auth/components/AuthShell';
import { LoginForm } from '@/features/auth';

export const metadata = {
  title: 'Sign in — DUNITE CMS',
  description: 'Sign in to DUNITE CMS',
};

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthBrand subtitle="Sign in" />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
