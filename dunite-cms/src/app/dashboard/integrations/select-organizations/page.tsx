import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { LinkedInOrganizationSelector } from '@/features/integrations/components/LinkedInOrganizationSelector';

interface SelectOrganizationsPageProps {
  searchParams: Promise<{ state?: string }>;
}

export const metadata = {
  title: 'Connect LinkedIn Organizations — DUNITE CMS',
};

export default async function SelectOrganizationsPage({ searchParams }: SelectOrganizationsPageProps) {
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
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A66C2]">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">LinkedIn authorized</h1>
        <p className="mt-1 text-muted-foreground">
          Choose which organizations to connect to DUNITE CMS.
        </p>
      </div>

      <Suspense>
        <LinkedInOrganizationSelector stateId={stateId} />
      </Suspense>
    </div>
  );
}
