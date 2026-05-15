'use client';

import { useId } from 'react';

import { PLATFORMS } from '@/features/composer/lib/platforms';
import { cn } from '@/lib/utils';

import type { NormalizedImportRow } from '../types';

interface ImportRowInspectorProps {
  row: NormalizedImportRow | null;
  className?: string;
}

export function ImportRowInspector({ row, className }: ImportRowInspectorProps) {
  const headingId = useId();

  if (!row) {
    return (
      <aside
        className={cn(
          'flex min-h-0 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground lg:w-80',
          className,
        )}
        aria-labelledby={headingId}
      >
        <h3 id={headingId} className="sr-only">
          Row validation details
        </h3>
        <p className="max-w-[14rem] leading-relaxed">Select a row in the preview table to inspect validation issues.</p>
      </aside>
    );
  }

  const plat = row.platforms.map((p) => PLATFORMS[p]?.label ?? p).join(', ');

  return (
    <aside
      className={cn(
        'flex max-h-[min(420px,50vh)] min-h-0 w-full flex-col overflow-y-auto rounded-lg border border-foreground/10 bg-muted/20 p-4 text-sm lg:w-80',
        className,
      )}
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Row {row.sourceRowIndex}
      </h3>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd className="font-medium text-foreground">{row.validationState}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Platforms</dt>
          <dd className="text-foreground">{plat || '—'}</dd>
        </div>
        {row.publishAt && (
          <div>
            <dt className="text-muted-foreground">Publish</dt>
            <dd className="text-foreground">
              {new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(row.publishAt)}
            </dd>
          </div>
        )}
        {row.fingerprints && (
          <div>
            <dt className="text-muted-foreground">Fingerprints</dt>
            <dd className="break-all font-mono text-[10px] text-muted-foreground">
              content:{row.fingerprints.content.slice(0, 12)}…
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-foreground">Issues ({row.issues.length})</p>
        {row.issues.length === 0 ? (
          <p className="text-muted-foreground">No issues for this row.</p>
        ) : (
          <ul className="space-y-2">
            {row.issues.map((issue, idx) => (
              <li
                key={`${issue.code}-${idx}`}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-xs',
                  issue.severity === 'error'
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : 'border-amber-500/30 bg-amber-500/5 text-amber-900',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="rounded bg-background/80 px-1 text-[10px] text-foreground">{issue.code}</code>
                  <span className="text-[10px] font-medium uppercase">{issue.severity}</span>
                </div>
                <p className="mt-1 text-foreground">{issue.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground">
        Server-side rules in Postgres can extend these checks before any commit.
      </p>
    </aside>
  );
}
