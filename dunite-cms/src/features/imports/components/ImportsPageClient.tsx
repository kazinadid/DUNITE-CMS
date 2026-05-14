'use client';

import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/features/dashboard/components/PageHeader';
import type { Role } from '@/features/auth';
import { canRunBatchImport, isViewer } from '@/lib/rbac';

import { ImportHistoryDashboard } from './ImportHistoryDashboard';
import { ImportWorkflowBody } from './ImportWorkflowBody';

interface ImportsPageClientProps {
  role: Role;
}

export function ImportsPageClient({ role }: ImportsPageClientProps) {
  const viewer = isViewer(role);
  const canImport = canRunBatchImport(role);

  if (viewer) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader
          title="Campaign import"
          description="Read-only import history and queue status. Editors and admins run staging and execution."
        />
        <div className="flex flex-wrap gap-2">
          <a
            href="/dashboard/imports/operations"
            className="inline-flex items-center rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
          >
            Open import operations
          </a>
        </div>
        <ImportHistoryDashboard role={role} />
      </div>
    );
  }

  if (!canImport) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeader title="Campaign import" description="Bulk parsing for scheduled social content." />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You do not have permission to run batch imports.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 md:px-6">
        <a
          href="/dashboard/imports/operations"
          className="inline-flex items-center rounded-lg border border-foreground/15 bg-muted/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          Import operations dashboard
        </a>
      </div>
      <ImportWorkflowBody
        className="p-4 pb-6 md:p-6"
        role={role}
        headerSlot={
          <PageHeader
            title="Campaign import"
            description="Parse and validate locally, then stage rows in Supabase, queue for workers, and run chunked execution (draft / scheduled posts only — no platform publish)."
          />
        }
      />
      <div className="px-4 pb-10 md:px-6">
        <ImportHistoryDashboard role={role} />
      </div>
    </div>
  );
}
