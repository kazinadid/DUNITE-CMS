'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/features/dashboard/components/PageHeader';
import type { Role } from '@/features/auth';
import { canRunBatchImport } from '@/lib/rbac';

import { ImportWorkflowBody } from './ImportWorkflowBody';

interface ImportsPageClientProps {
  role: Role;
}

export function ImportsPageClient({ role }: ImportsPageClientProps) {
  const allowed = canRunBatchImport(role);

  if (!allowed) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader
          title="Campaign import"
          description="Bulk parsing for scheduled social content."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Viewers cannot access batch imports. Ask an admin to promote your account to editor.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ImportWorkflowBody
      className="p-4 pb-10 md:p-6"
      headerSlot={
        <PageHeader
          title="Campaign import"
          description="Parse CSV/XLSX sheets into normalized campaign rows. The next step will stage rows in Supabase `import_jobs` / `import_rows` and commit posts when you wire the backend action."
        />
      }
    />
  );
}
