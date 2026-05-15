'use client';

import Link from 'next/link';

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
          <Link
            href="/dashboard/imports/operations"
            className="inline-flex items-center rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
          >
            Open import operations
          </Link>
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
    <div className="min-w-0 space-y-5 overflow-x-hidden bg-muted/10">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 md:px-6">
        <Link
          href="/dashboard/imports/operations"
          className="inline-flex items-center rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-primary/[0.04]"
        >
          Import operations dashboard
        </Link>
      </div>
      <ImportWorkflowBody
        className="px-3 pb-3 sm:px-4 md:px-6"
        role={role}
        headerSlot={
          <PageHeader
            title="Campaign import"
            description="Parse and validate locally, then stage rows in Supabase, queue for workers, and run chunked execution (draft / scheduled posts only — no platform publish)."
          />
        }
      />
      <div className="min-w-0 px-3 pb-10 sm:px-4 md:px-6">
        <ImportHistoryDashboard role={role} className="opacity-95" />
      </div>
    </div>
  );
}
