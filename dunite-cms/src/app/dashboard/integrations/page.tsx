import { Suspense } from 'react';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getUserDefaultOrganization } from '@/features/integrations/server/socialAccountsRepository';
import { IntegrationsDashboard } from '@/features/integrations/components/IntegrationsDashboard';

export const metadata = {
  title: 'Social Integrations — DUNITE CMS',
  description: 'Manage connected social media accounts and Pages.',
};

export default async function IntegrationsPage() {
  // Server-side auth check
  let userId: string;
  let userRole: string;
  try {
    const { user } = await createAuthenticatedSupabaseServerClient();
    userId = user.id;
    // Also read role from db
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await createSupabaseServerClient();
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    userRole = profile?.role ?? 'viewer';
  } catch {
    redirect('/login');
  }

  const orgInfo = await getUserDefaultOrganization(userId!);
  const canManage = userRole === 'admin' || userRole === 'editor';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Suspense>
        <IntegrationsDashboard
          canManage={canManage}
          organizationName={orgInfo?.name}
        />
      </Suspense>
    </div>
  );
}
