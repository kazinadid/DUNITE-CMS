'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { useBatchImportWorkflow } from '../hooks/useBatchImportWorkflow';

import { ImportDropzone } from './ImportDropzone';
import { ImportPreviewTable } from './ImportPreviewTable';

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

  useEffect(() => {
    if (state.phase === 'error' && state.fatalMessage) {
      toast.error(state.fatalMessage);
    }
    if (state.phase === 'cancelled') {
      toast.message('Import cancelled');
    }
    if (state.phase === 'ready' && state.summary) {
      toast.success(
        `Parsed ${state.summary.totalRows.toLocaleString()} row(s) in ${(state.summary.durationMs / 1000).toFixed(1)}s`,
      );
    }
  }, [state.phase, state.fatalMessage, state.summary]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-6', className)}>
      {headerSlot}

      <div className="grid min-h-0 gap-6 lg:grid-cols-[1fr,minmax(0,1.1fr)]">
        <Card className="min-h-0 border-foreground/10">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">Upload</CardTitle>
            <CardDescription>
              Files never leave your browser during parsing. Large workbooks are processed in chunks to keep the UI
              responsive.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 pt-4">
            <ImportDropzone onFile={(file) => void runParse(file)} disabled={false} busy={busy} />

            {busy && (
              <div className="space-y-3 rounded-xl border border-foreground/10 bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {state.phase === 'reading' && 'Reading file…'}
                    {state.phase === 'parsing' && 'Parsing spreadsheet…'}
                    {state.phase === 'normalizing' && 'Mapping columns…'}
                    {state.phase === 'validating' && 'Validating rows…'}
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
                  Parsing summary
                </h3>
                <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                  <li>
                    Rows parsed:{' '}
                    <span className="font-medium text-foreground">
                      {state.summary.totalRows.toLocaleString()}
                    </span>
                  </li>
                  <li>
                    Duration: <span className="font-medium text-foreground">{state.summary.durationMs} ms</span>
                  </li>
                  <li>
                    Ready rows:{' '}
                    <span className="font-medium text-foreground">{state.summary.validRows.toLocaleString()}</span>
                  </li>
                  <li>
                    Rows with errors:{' '}
                    <span className="font-medium text-destructive">
                      {state.summary.rowsWithErrors.toLocaleString()}
                    </span>
                  </li>
                  <li className="flex items-start gap-2 sm:col-span-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                    <span>
                      Rows with warnings: {state.summary.rowsWithWarnings.toLocaleString()} (platform media rules,
                      unknown tokens, etc.)
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
              <Button variant="outline" size="sm" type="button" className="w-fit" onClick={() => reset()}>
                Reset upload
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col border-foreground/10">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-base">Preview (import staging)</CardTitle>
            <CardDescription>
              Validation is client-side only. The preview grid virtualizes rendering so ten-thousand-row sheets stay
              scrollable without freezing Chrome.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
            <ImportPreviewTable rows={state.rows} className="min-h-0 flex-1" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
