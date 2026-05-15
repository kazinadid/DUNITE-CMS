'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import type { Role } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { canRunBatchImport } from '@/lib/rbac';

import { useBatchImportWorkflow } from '../hooks/useBatchImportWorkflow';
import { useImportPreviewSession } from '../hooks/useImportPreviewSession';
import { groupIssuesFromRows } from '../lib/groupIssuesFromRows';

import { ImportCampaignColumnGuide } from './ImportCampaignColumnGuide';
import { ImportDropzone } from './ImportDropzone';
import { ImportGroupedIssuesPanel } from './ImportGroupedIssuesPanel';
import { ImportPhaseStepper } from './ImportPhaseStepper';
import { ImportPreviewMetricsCards } from './ImportPreviewMetricsCards';
import { ImportPreviewTable } from './ImportPreviewTable';
import { ImportPreviewToolbar } from './ImportPreviewToolbar';
import { ImportRowInspector } from './ImportRowInspector';
import { ImportSchemaBlockedPanel } from './ImportSchemaBlockedPanel';
import { ImportStagingControls } from './ImportStagingControls';
import { ValidationSummaryBar } from './ValidationSummaryBar';

const BUSY_PHASES = new Set([
  'reading',
  'parsing',
  'normalizing',
  'validating',
]);

interface ImportWorkflowBodyProps {
  className?: string;
  headerSlot?: ReactNode;
  /** When omitted, preparation actions stay enabled (e.g. embedded dialog with implicit editor). */
  role?: Role;
}

export function ImportWorkflowBody({ className, headerSlot, role }: ImportWorkflowBodyProps) {
  const { state, runParse, cancel, reset, revalidateCurrentImport, retryLastParse } = useBatchImportWorkflow();
  const busy = BUSY_PHASES.has(state.phase);
  const canMutate = role == null || canRunBatchImport(role);

  const previewResetKey = useMemo(
    () => `${state.fileName ?? ''}|${state.summary?.durationMs ?? 0}`,
    [state.fileName, state.summary?.durationMs],
  );

  const preview = useImportPreviewSession({
    rows: state.rows,
    resetKey: previewResetKey,
  });

  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (state.rows.length === 0) {
      queueMicrotask(() => setSelectedSourceIndex(null));
    }
  }, [state.rows.length]);

  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'reading' || state.phase === 'parsing') {
      queueMicrotask(() => setSelectedSourceIndex(null));
    }
  }, [state.phase]);

  useEffect(() => {
    if (
      selectedSourceIndex != null &&
      !preview.displayedRows.some((r) => r.sourceRowIndex === selectedSourceIndex)
    ) {
      queueMicrotask(() => setSelectedSourceIndex(null));
    }
  }, [preview.displayedRows, selectedSourceIndex]);

  const selectedRow = useMemo(
    () => state.rows.find((r) => r.sourceRowIndex === selectedSourceIndex) ?? null,
    [state.rows, selectedSourceIndex],
  );

  const groupedVisible = useMemo(
    () => groupIssuesFromRows(preview.displayedRows, { limit: 10 }),
    [preview.displayedRows],
  );

  useEffect(() => {
    if (state.phase === 'error' && state.fatalMessage) {
      toast.error(state.fatalMessage);
    }
    if (state.phase === 'cancelled') {
      toast.message('Import cancelled');
    }
    if (state.phase === 'ready' && state.summary) {
      const v = state.summary.validation;
      toast.success(
        `Validated ${state.summary.totalRows.toLocaleString()} row(s) in ${(state.summary.durationMs / 1000).toFixed(1)}s — ${v.invalidRows} invalid, ${v.skippedRows} skipped, readiness ${v.readinessPct}%.`,
      );
    }
    if (state.phase === 'schema_blocked' && state.schemaFailure) {
      const miss = state.schemaFailure.missingRequired.join(', ');
      toast.error(`Import blocked: required column(s) missing (${miss}). Use the template below and try again.`);
    }
  }, [state.phase, state.fatalMessage, state.summary, state.schemaFailure]);

  const previewCardExpanded =
    state.rows.length > 0 || (state.phase === 'schema_blocked' && state.schemaFailure != null);

  const showPreviewChrome = state.phase === 'ready' && state.rows.length > 0;

  const handleClearImport = () => {
    setSelectedSourceIndex(null);
    reset();
  };

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden', className)}>
      <div className="sticky top-0 z-30 min-w-0 rounded-2xl border border-foreground/10 bg-background/95 p-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/85">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">{headerSlot}</div>
          <div className="min-w-0 xl:min-w-[42rem]">
            <ImportPhaseStepper phase={state.phase} />
          </div>
        </div>
      </div>

      {state.summary?.validation && !busy && (
        <ValidationSummaryBar validation={state.summary.validation} pending={busy} />
      )}

      <div className="grid min-h-0 min-w-0 gap-4 xl:grid-cols-[minmax(18rem,22rem),minmax(0,1fr)] 2xl:grid-cols-[minmax(20rem,24rem),minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 space-y-4">
          <Card className="min-w-0 border-foreground/10 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-4 py-3">
              <CardTitle className="text-sm">Prepare file</CardTitle>
              <CardDescription className="text-xs">
                Parse locally, map columns, and validate before anything is staged.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <ImportDropzone onFile={(file) => void runParse(file)} disabled={!canMutate} busy={busy} />

              {busy && (
                <div className="space-y-2 rounded-xl border border-foreground/10 bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {state.phase === 'reading' && 'Reading file…'}
                      {state.phase === 'parsing' && 'Parsing spreadsheet…'}
                      {state.phase === 'normalizing' && 'Mapping columns…'}
                      {state.phase === 'validating' && 'Running validation…'}
                    </span>
                    <Button variant="ghost" size="xs" type="button" onClick={() => cancel()}>
                      Cancel
                    </Button>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={state.displayProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                      style={{ width: `${state.displayProgress}%` }}
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {state.fileName ? `${state.fileName} · ` : ''}
                    {state.displayProgress}%
                  </p>
                </div>
              )}

              {state.phase === 'error' && state.fatalMessage && (
                <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{state.fatalMessage}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit border-destructive/40"
                    disabled={!canMutate || !state.fileName || busy}
                    onClick={() => retryLastParse()}
                  >
                    Retry parse
                  </Button>
                </div>
              )}

              {state.summary && !busy && (
                <div className="rounded-xl border border-foreground/10 bg-muted/20 p-3 text-xs">
                  <h3 className="flex items-center gap-2 font-medium text-foreground">
                    <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                    Parse complete
                  </h3>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <dt>Rows</dt>
                      <dd className="font-medium text-foreground">{state.summary.totalRows.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd className="font-medium text-foreground">{(state.summary.durationMs / 1000).toFixed(1)}s</dd>
                    </div>
                    <div>
                      <dt>Invalid</dt>
                      <dd className="font-medium text-destructive">
                        {state.summary.validation.invalidRows.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt>Ready</dt>
                      <dd className="font-medium text-foreground">
                        {state.summary.validation.stagingReadyRows.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {state.phase !== 'idle' && !busy && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-full"
                  disabled={!canMutate}
                  onClick={() => {
                    setSelectedSourceIndex(null);
                    reset();
                  }}
                >
                  Reset upload
                </Button>
              )}
            </CardContent>
          </Card>

          <ImportCampaignColumnGuide />
        </aside>

        <section className="min-h-0 min-w-0 space-y-4 overflow-hidden">
          <Card className="flex min-h-[520px] min-w-0 flex-col border-foreground/10 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Preview workspace</CardTitle>
                  <CardDescription className="text-xs">
                    Virtualized table, row diagnostics, filters, and bulk preparation.
                  </CardDescription>
                </div>
                {showPreviewChrome && (
                  <span className="rounded-full border border-foreground/10 bg-background px-2.5 py-1 text-xs text-muted-foreground">
                    {preview.displayedRows.length.toLocaleString()} / {state.rows.length.toLocaleString()} rows
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-3 p-4',
                previewCardExpanded ? 'lg:items-stretch' : 'lg:items-start',
              )}
            >
              {state.phase === 'schema_blocked' && state.schemaFailure ? (
                <ImportSchemaBlockedPanel failure={state.schemaFailure} className="w-full flex-1" />
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                  {showPreviewChrome && (
                    <ImportPreviewToolbar
                      searchInput={preview.searchInput}
                      onSearchInputChange={preview.setSearchInput}
                      filterMode={preview.filterMode}
                      onFilterModeChange={preview.setFilterMode}
                      displayedCount={preview.displayedRows.length}
                      totalParsedCount={state.rows.length}
                      excludedCount={preview.excludedSourceIndices.size}
                      bulkSelectedCount={preview.bulkSelected.size}
                      onSelectAllVisible={preview.selectAllVisible}
                      onClearBulkSelection={preview.clearBulkSelection}
                      onRemoveSelected={preview.removeSelectedRows}
                      onRemoveInvalid={preview.removeInvalidRows}
                      onRemoveSkipped={preview.removeSkippedRows}
                      onClearExclusions={preview.clearExclusions}
                      onRevalidate={() => {
                        revalidateCurrentImport();
                        toast.message('Re-validated import rows.');
                      }}
                      onRetryParse={() => void retryLastParse()}
                      onClearImport={handleClearImport}
                      canMutate={canMutate}
                      revalidateDisabled={state.phase !== 'ready' || state.rows.length === 0 || busy}
                      retryDisabled={!state.fileName || busy}
                    />
                  )}

                  {showPreviewChrome && preview.isFilteredView && preview.visibleValidation && (
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr),minmax(18rem,0.8fr)]">
                      <ImportPreviewMetricsCards
                        validation={preview.visibleValidation}
                        subtitle="Visible subset after filters and hidden rows."
                      />
                      <ImportGroupedIssuesPanel errors={groupedVisible.errors} warnings={groupedVisible.warnings} />
                    </div>
                  )}

                  <div className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr),minmax(18rem,22rem)] 2xl:grid-cols-[minmax(0,1fr),22rem]">
                    <ImportPreviewTable
                      rows={showPreviewChrome ? preview.displayedRows : state.rows}
                      selectedSourceIndex={selectedSourceIndex}
                      onRowActivate={setSelectedSourceIndex}
                      bulkSelected={preview.bulkSelected}
                      onToggleBulkSelect={preview.toggleBulkSelect}
                      readOnly={!canMutate}
                      className={cn('min-w-0', state.rows.length > 0 ? 'min-h-[360px] flex-1' : 'flex-none shrink-0')}
                    />
                    <ImportRowInspector row={selectedRow} className="shrink-0 lg:self-stretch" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {state.phase === 'ready' && state.rows.length > 0 && canMutate && (
            <ImportStagingControls
              canMutate={canMutate}
              rows={state.rows}
              fileName={state.fileName}
              fileKind={state.fileKind}
              workflowReady={state.phase === 'ready' && state.rows.length > 0}
              debugRole={role}
            />
          )}
        </section>
      </div>
    </div>
  );
}
