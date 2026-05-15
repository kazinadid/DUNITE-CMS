'use client';

import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ImportSchemaFailure } from '../types';

function enterpriseSchemaMessage(failure: ImportSchemaFailure): string {
  const missing = failure.missingRequired.map((m) => `- ${m}`).join('\n');
  const detected =
    failure.detectedRawHeaders.length > 0
      ? failure.detectedRawHeaders.map((h) => `- ${h}`).join('\n')
      : '- (no headers detected)';
  return `Missing required columns:\n${missing}\n\nDetected columns:\n${detected}`;
}

export interface ImportSchemaBlockedPanelProps {
  failure: ImportSchemaFailure;
  className?: string;
}

/**
 * Blocking surface when the workbook header row doesn't map to campaign fields —
 * row validation is skipped so rows are never classified as empty_import_row solely due to bad headers.
 */
export function ImportSchemaBlockedPanel({ failure, className }: ImportSchemaBlockedPanelProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div
        role="alert"
        className="rounded-xl border border-destructive/35 bg-destructive/5 p-4 text-sm shadow-sm ring-1 ring-destructive/15"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="font-semibold text-destructive">Unsupported spreadsheet schema</p>
              <p className="mt-1 text-muted-foreground">
                Row validation was skipped because required campaign columns could not be found in the header row.
              </p>
            </div>

            <div className="rounded-lg bg-background/80 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground shadow-inner ring-1 ring-border/80">
              {enterpriseSchemaMessage(failure)}
            </div>

            <p className="text-xs text-muted-foreground">
              Use the expected column list and template downloads in the <span className="font-medium text-foreground">Upload</span>{' '}
              panel, then try again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
