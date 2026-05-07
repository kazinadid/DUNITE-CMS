import { Suspense } from 'react';

import { LoginForm } from '@/features/auth';

export const metadata = {
  title: 'Sign in — Dunite CMS',
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 sm:p-8">
      {/* Subtle radial gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,oklch(0.97_0_0)_0%,transparent_100%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,oklch(0.22_0_0)_0%,transparent_100%)]"
      />

      {/* Dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(oklch(0.7_0_0/0.35)_1px,transparent_1px)] [background-size:24px_24px] dark:[background-image:radial-gradient(oklch(0.5_0_0/0.25)_1px,transparent_1px)]"
      />

      <div className="relative z-10 w-full max-w-md">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
