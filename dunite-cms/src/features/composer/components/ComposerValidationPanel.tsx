'use client';

import { CheckCircle2, CircleAlert, ShieldAlert, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_ORDER, PLATFORMS } from '../lib/platforms';
import type { PlatformId, ValidationIssue, ValidationReport } from '../types';

type CardState = 'blocked' | 'warn' | 'ready';

function cardStateFor(issues: ValidationIssue[], globalBlockingError: boolean): CardState {
  const errs = issues.filter((x) => x.severity === 'error');
  const wrns = issues.filter((x) => x.severity === 'warning');
  if (errs.length > 0 || globalBlockingError) return 'blocked';
  if (wrns.length > 0) return 'warn';
  return 'ready';
}

function IssueRows({ list }: { list: ValidationIssue[] }) {
  if (list.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5 text-[13px] leading-snug">
      {list.map((issue, idx) => {
        const glyph =
          issue.severity === 'error' ? (
            <span className="text-red-600" aria-hidden title="Blocked">
              ✕
            </span>
          ) : issue.severity === 'warning' ? (
            <span className="text-amber-600" aria-hidden title="Warning">
              ⚠
            </span>
          ) : (
            <span className="text-sky-600" aria-hidden title="Recommendation">
              ◆
            </span>
          );
        return (
          <li key={`${issue.code ?? ''}-${issue.message}-${idx}`} className="flex gap-2 text-gray-700">
            <span className="mt-px w-3 shrink-0 text-center font-bold">{glyph}</span>
            <span className="flex-1">{issue.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * SaaS-grade validation cockpit: per-platform cards + global checklist.
 */
export function ComposerValidationPanel({
  platforms,
  report,
  className,
}: {
  platforms: PlatformId[];
  report: ValidationReport;
  className?: string;
}) {
  const globalIssues = report.issues.filter((i) => i.platform === null);
  /** Schedule/MIME/audio issues without a network tag still halt publish flows. */
  const globalBlockingError = report.errors.some((e) => e.platform === null);

  const ordered = PLATFORM_ORDER.filter((id) => platforms.includes(id));

  return (
    <div className={cn('space-y-3', className)}>
      {/* Global */}
      <section
        aria-label="Publishing checklist"
        className={cn(
          'rounded-xl border p-4 shadow-sm transition-colors',
          globalIssues.some((g) => g.severity === 'error')
            ? 'border-red-200/70 bg-red-50/55'
            : globalIssues.some((g) => g.severity === 'warning')
            ? 'border-amber-200/70 bg-amber-50/40'
            : 'border-gray-100 bg-white',
        )}
      >
        <div className="flex items-center gap-2">
          {globalIssues.some((g) => g.severity === 'error') ? (
            <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden />
          ) : globalIssues.some((g) => g.severity === 'warning') ? (
            <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          )}
          <h3 className="text-sm font-semibold text-gray-900">Publishing checklist</h3>
        </div>
        {globalIssues.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">
            {platforms.length === 0
              ? 'Pick channels to unlock platform-specific guidance.'
              : 'No blocking items across every shared surface.'}
          </p>
        ) : (
          <IssueRows list={globalIssues} />
        )}
      </section>

      {ordered.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center text-xs text-gray-500">
          Select one or more networks to inspect live validation decks.
        </p>
      )}

      {/* Per-platform */}
      <div className="space-y-3">
        {ordered.map((id) => {
          const cfg    = PLATFORMS[id];
          const scoped = report.issues.filter((i) => i.platform === id);

          /** Client media MIME errors bubble platform-null — replicate as shared risk on every card textually */
          const state = cardStateFor(scoped, globalBlockingError);

          const errs   = scoped.filter((s) => s.severity === 'error');
          const wrns   = scoped.filter((s) => s.severity === 'warning');
          const recs   = scoped.filter((s) => s.severity === 'recommendation');

          const badgeIcon =
            state === 'blocked' ? ShieldAlert : state === 'warn' ? CircleAlert : CheckCircle2;
          const badgeCopy =
            state === 'blocked' ? 'Blocked' : state === 'warn' ? 'Needs attention' : 'Ready';

          const Icon = badgeIcon;

          return (
            <section
              key={id}
              aria-label={`${cfg.label} validation`}
              className={cn(
                'overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200',
                state === 'blocked'
                  ? 'border-red-200/80 shadow-red-100/40'
                  : state === 'warn'
                  ? 'border-amber-200/80 shadow-amber-100/35'
                  : 'border-emerald-200/55 shadow-emerald-100/35',
              )}
            >
              <div className="flex items-center gap-3 border-b border-gray-50 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-50 text-gray-800 ring-1 ring-gray-100">
                  <PlatformIcon platform={id} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{cfg.label}</p>
                  {id === 'twitter' && report.twitterSegments.length > 1 && (
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Thread · {report.twitterSegments.length} posts
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
                    state === 'blocked'
                      ? 'bg-red-50 text-red-700 ring-red-200'
                      : state === 'warn'
                      ? 'bg-amber-50 text-amber-800 ring-amber-200'
                      : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
                  )}
                >
                  <Icon size={12} aria-hidden />
                  {badgeCopy}
                </span>
              </div>

              <div className="space-y-2 px-4 py-3 text-sm">
                {errs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                      Errors
                    </p>
                    <IssueRows list={errs} />
                  </div>
                )}
                {wrns.length > 0 && (
                  <div className={cn(errs.length > 0 ? 'border-t border-dashed border-gray-100 pt-2' : '')}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      Warnings
                    </p>
                    <IssueRows list={wrns} />
                  </div>
                )}
                {recs.length > 0 && (
                  <div
                    className={cn(
                      errs.length > 0 || wrns.length > 0
                        ? 'border-t border-dashed border-gray-100 pt-2'
                        : '',
                    )}
                  >
                    <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      <Sparkles size={11} aria-hidden />
                      Recommendations
                    </p>
                    <IssueRows list={recs} />
                  </div>
                )}
                {!errs.length && !wrns.length && !recs.length && (
                  <p className="text-xs text-gray-500">
                    {globalBlockingError
                      ? `Resolve checklist blockers · ${cfg.shortLabel} follows automatically.`
                      : 'Looks tight for this network — previews stay authoritative.'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
