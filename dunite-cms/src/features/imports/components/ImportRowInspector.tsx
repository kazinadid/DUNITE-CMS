'use client';

import { useId, useMemo } from 'react';

import { PLATFORMS } from '@/features/composer/lib/platforms';
import { cn } from '@/lib/utils';

import { formatPublishAtForDisplay } from '../lib/dates';
import { ImportIssueCode } from '../validation/issueCodes';

import { ValidationStateBadge, validationStateMeta } from './ValidationStateBadge';

import type { NormalizedImportRow } from '../types';
import type { ValidationIssue } from '../validation/validationTypes';

const DUPLICATE_CODES = new Set<string>([
  ImportIssueCode.DUPLICATE_CONTENT,
  ImportIssueCode.DUPLICATE_MEDIA_URL,
  ImportIssueCode.DUPLICATE_SCHEDULE,
]);

function partitionIssues(issues: readonly ValidationIssue[]) {
  const duplicateRelated = issues.filter((i) => DUPLICATE_CODES.has(i.code));
  const nonDup = issues.filter((i) => !DUPLICATE_CODES.has(i.code));
  const errors = nonDup.filter((i) => i.severity === 'error');
  const warnings = nonDup.filter((i) => i.severity === 'warning');
  return { errors, warnings, duplicateRelated };
}

interface ImportRowInspectorProps {
  row: NormalizedImportRow | null;
  className?: string;
}

export function ImportRowInspector({ row, className }: ImportRowInspectorProps) {
  const headingId = useId();
  const partitioned = useMemo(() => (row ? partitionIssues(row.issues) : null), [row]);

  if (!row) {
    return (
      <aside
        className={cn(
          'flex min-h-0 min-w-0 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-foreground/15 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground xl:w-[22rem]',
          className,
        )}
        aria-labelledby={headingId}
      >
        <h3 id={headingId} className="sr-only">
          Row validation details
        </h3>
        <p className="max-w-[16rem] leading-relaxed">
          Select a row in the preview grid to inspect normalized fields, duplicate signals, and validation diagnostics.
        </p>
      </aside>
    );
  }

  const plat = row.platforms.map((p) => PLATFORMS[p]?.label ?? p).join(', ');
  const { errors, warnings, duplicateRelated } = partitioned!;
  const stateMeta = validationStateMeta(row.validationState);

  return (
    <aside
      className={cn(
        'flex max-h-[min(480px,55vh)] min-h-0 min-w-0 w-full flex-col overflow-y-auto rounded-xl border border-foreground/10 bg-muted/15 p-4 text-sm xl:w-[22rem]',
        className,
      )}
      aria-labelledby={headingId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <h3 id={headingId} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Row {row.sourceRowIndex}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{stateMeta.description}</p>
        </div>
        <ValidationStateBadge state={row.validationState} size="md" />
      </div>

      <section className="mt-4 space-y-2" aria-label="Normalized fields">
        <h4 className="text-xs font-semibold text-foreground">Normalized data</h4>
        <dl className="grid gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Post text</dt>
            <dd className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-foreground">
              {row.postText || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Platforms</dt>
            <dd className="mt-0.5 text-foreground">{plat || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Publish</dt>
            <dd className="mt-0.5 text-foreground">
              {formatPublishAtForDisplay(row.publishAt, row.publishAtRaw, {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </dd>
          </div>
          {row.parseHints.dateParseDiagnostics && (
            <div className="rounded-md border border-foreground/10 bg-background/80 p-2">
              <p className="text-muted-foreground">Publish date parsing</p>
              <div className="mt-1 space-y-1 font-mono text-[10px] text-foreground/90">
                <div>
                  <span className="text-muted-foreground">Original: </span>
                  {row.parseHints.dateParseDiagnostics.original || '—'}
                </div>
                {row.parseHints.dateParseDiagnostics.normalizedIso != null && (
                  <div>
                    <span className="text-muted-foreground">UTC normalized: </span>
                    {row.parseHints.dateParseDiagnostics.normalizedIso}
                  </div>
                )}
                {row.parseHints.dateParseDiagnostics.reason && (
                  <div>
                    <span className="text-muted-foreground">Note: </span>
                    {row.parseHints.dateParseDiagnostics.reason}
                  </div>
                )}
              </div>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Hashtags</dt>
            <dd className="mt-0.5 break-words text-foreground">{row.hashtags.length ? row.hashtags.join(' ') : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Media URLs</dt>
            <dd className="mt-0.5 max-h-24 overflow-y-auto break-all font-mono text-[11px] text-foreground">
              {row.mediaUrls.length ? row.mediaUrls.join('\n') : '—'}
            </dd>
          </div>
        </dl>
      </section>

      {(duplicateRelated.length > 0 || row.validationState === 'duplicate') && (
        <section className="mt-4 space-y-2" aria-label="Duplicate diagnostics">
          <h4 className="text-xs font-semibold text-violet-950">Duplicate signals</h4>
          {row.validationState === 'duplicate' && (
            <p className="text-xs text-violet-900">This row is classified as a duplicate relative to other rows.</p>
          )}
          {duplicateRelated.length > 0 ? (
            <ul className="space-y-2">
              {duplicateRelated.map((issue, idx) => (
                <li
                  key={`dup-${issue.code}-${idx}`}
                  className="rounded-md border border-violet-500/25 bg-violet-500/5 px-2 py-1.5 text-xs text-violet-950"
                >
                  <code className="text-[10px]">{issue.code}</code>
                  <p className="mt-1 text-foreground">{issue.message}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <section className="mt-4 space-y-2" aria-label="Validation issues">
        <h4 className="text-xs font-semibold text-foreground">Issues ({row.issues.length})</h4>
        {errors.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase text-destructive">Errors</p>
            <ul className="space-y-2">
              {errors.map((issue, idx) => (
                <li
                  key={`e-${issue.code}-${idx}`}
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs"
                >
                  <code className="text-[10px] text-destructive">{issue.code}</code>
                  <p className="mt-1 text-foreground">{issue.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase text-amber-900">Warnings</p>
            <ul className="space-y-2">
              {warnings.map((issue, idx) => (
                <li
                  key={`w-${issue.code}-${idx}`}
                  className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-950"
                >
                  <code className="text-[10px]">{issue.code}</code>
                  <p className="mt-1 text-foreground">{issue.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {row.issues.length === 0 && <p className="text-xs text-muted-foreground">No issues for this row.</p>}
      </section>

      {row.fingerprints && (
        <section className="mt-4 text-[10px] text-muted-foreground" aria-label="Fingerprints">
          <h4 className="mb-1 text-xs font-semibold text-foreground">Fingerprints</h4>
          <p className="break-all font-mono">content:{row.fingerprints.content.slice(0, 16)}…</p>
        </section>
      )}

      <p className="mt-4 text-[10px] leading-snug text-muted-foreground">
        Staging preview only — server policies on `import_jobs` / `import_rows` apply before any post commit.
      </p>
    </aside>
  );
}
