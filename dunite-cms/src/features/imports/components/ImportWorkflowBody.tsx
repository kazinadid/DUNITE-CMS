'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { useBatchImportWorkflow } from '../hooks/useBatchImportWorkflow';

import { ImportCampaignColumnGuide } from './ImportCampaignColumnGuide';
import { ImportDropzone } from './ImportDropzone';
import { ImportPreviewTable } from './ImportPreviewTable';
import { ImportRowInspector } from './ImportRowInspector';
import { ImportSchemaBlockedPanel } from './ImportSchemaBlockedPanel';
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
}

export function ImportWorkflowBody({ className, headerSlot }: ImportWorkflowBodyProps) {
  const { state, runParse, cancel, reset } = useBatchImportWorkflow();
  const busy = BUSY_PHASES.has(state.phase);

  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (state.rows.length === 0) setSelectedSourceIndex(null);
  }, [state.rows.length]);

  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'reading' || state.phase === 'parsing') {
      setSelectedSourceIndex(null);
    }
  }, [state.phase]);

  const selectedRow = useMemo(
    () => state.rows.find((r) => r.sourceRowIndex === selectedSourceIndex) ?? null,
    [state.rows, selectedSourceIndex],
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

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-6', className)}>
      {headerSlot}

      {state.summary?.validation && !busy && (
        <ValidationSummaryBar validation={state.summary.validation} pending={busy} />
      )}

      <div className="grid min-h-0 gap-6 lg:grid-cols-[1fr,minmax(0,1.15fr)]">
        <Card className="min-h-0 border-foreground/10">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">Upload</CardTitle>
            <CardDescription>
              Files stay in-browser for parsing and validation. Nothing is committed to posts or media tables here —
              staging only.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <ImportDropzone onFile={(file) => void runParse(file)} disabled={false} busy={busy} />

            <ImportCampaignColumnGuide />

            {busy && (
              <div className="space-y-3 rounded-xl border border-foreground/10 bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {state.phase === 'reading' && 'Reading file…'}
                    {state.phase === 'parsing' && 'Parsing spreadsheet…'}
                    {state.phase === 'normalizing' && 'Mapping columns…'}
                    {state.phase === 'validating' && 'Running validation engine…'}
                  </span>
                  <Button variant="ghost" size="xs" type="button" onClick={() => cancel()}>
                    Cancel
                  </Button>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
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
                <p className="text-xs text-muted-foreground">
                  {state.fileName ? (
                    <>
                      <span className="font-medium text-foreground">{state.fileName}</span>
                      {' · '}
                    </>
                  ) : null}
                  Progress {state.displayProgress}%
                </p>
              </div>
            )}

            {state.summary && !busy && (
              <div className="grid gap-2 rounded-xl border border-foreground/10 bg-muted/30 p-4 text-sm">
                <h3 className="flex items-center gap-2 font-medium text-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
                  Run summary
                </h3>
                <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                  <li>
                    Rows:{' '}
                    <span className="font-medium text-foreground">
                      {state.summary.totalRows.toLocaleString()}
                    </span>
                  </li>
                  <li>
                    Duration: <span className="font-medium text-foreground">{state.summary.durationMs} ms</span>
                  </li>
                  <li>
                    Invalid (blocking):{' '}
                    <span className="font-medium text-destructive">
                      {state.summary.validation.invalidRows.toLocaleString()}
                    </span>
                  </li>
                  <li>
                    Skipped empty:{' '}
                    <span className="font-medium text-foreground">
                      {state.summary.validation.skippedRows.toLocaleString()}
                    </span>
                  </li>
                  <li className="flex items-start gap-2 sm:col-span-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    <span>
                      Readiness {state.summary.validation.readinessPct}% ·{' '}
                      {state.summary.validation.stagingReadyRows.toLocaleString()} rows could be staged after server
                      checks.
                    </span>
                  </li>
                </ul>
              </div>
            )}

            {state.phase === 'error' && state.fatalMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{state.fatalMessage}</span>
              </div>
            )}

            {state.phase !== 'idle' && !busy && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="w-fit"
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

        <Card className="flex min-h-0 min-w-0 flex-col border-foreground/10">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">Preview & validation detail</CardTitle>
            <CardDescription>
              {state.rows.length > 0 ? (
                <>
                  Inline validation badges per row. Select a row for accessible details. Virtualized table keeps large
                  files responsive.
                </>
              ) : (
                <>Upload a file to populate the preview. Row-level issues and staging readiness appear after validation.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent
            className={cn(
              'flex flex-col gap-4 pt-4 lg:flex-row',
              previewCardExpanded ? 'min-h-0 flex-1 lg:items-stretch' : 'lg:items-start',
            )}
          >
            {state.phase === 'schema_blocked' && state.schemaFailure ? (
              <ImportSchemaBlockedPanel failure={state.schemaFailure} className="w-full lg:flex-1" />
            ) : (
              <>
                <ImportPreviewTable
                  rows={state.rows}
                  selectedSourceIndex={selectedSourceIndex}
                  onSelectSourceIndex={setSelectedSourceIndex}
                  className={cn('min-w-0', state.rows.length > 0 ? 'min-h-0 flex-1' : 'flex-none shrink-0')}
                />
                <ImportRowInspector row={selectedRow} className="shrink-0 lg:max-w-sm" />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
