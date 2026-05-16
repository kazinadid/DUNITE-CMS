import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { FacebookPageSelector } from '@/features/integrations/components/FacebookPageSelector';

interface SelectPagesPageProps {
  searchParams: Promise<{ state?: string }>;
}

export const metadata = {
  title: 'Connect Facebook Pages — DUNITE CMS',
};

export default async function SelectPagesPage({ searchParams }: SelectPagesPageProps) {
  const params = await searchParams;
  const stateId = params.state;

  if (!stateId) {
    redirect('/dashboard/integrations?error=no_state&message=Missing+session+parameter');
  }

  // Auth check
  try {
    await createAuthenticatedSupabaseServerClient();
  } catch {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1877F2]">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.032 4.388 11.031 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.975h-1.513c-1.491 0-1.956.93-1.956 1.883v2.256h3.328l-.532 3.49h-2.796v8.437C19.612 23.104 24 18.105 24 12.073z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Facebook authorized</h1>
        <p className="mt-1 text-muted-foreground">
          Choose which Pages to connect to DUNITE CMS.
        </p>
      </div>

      <Suspense>
        <FacebookPageSelector stateId={stateId} />
      </Suspense>
    </div>
  );
}
