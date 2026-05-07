import { Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/features/dashboard';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function SettingsPage() {
  // Server-side admin gate. Defense-in-depth on top of role-aware nav.
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/settings');
  }

  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Workspace and admin configuration."
      />

      <Card className="rounded-xl shadow-sm ring-0 border border-border">
        <CardHeader>
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">Admin area</CardTitle>
              <CardDescription>
                Only administrators can see this page.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-gray-50 px-4 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-muted-foreground shadow-sm">
              <SettingsIcon className="size-5" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">
              User management and workspace controls will live here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
