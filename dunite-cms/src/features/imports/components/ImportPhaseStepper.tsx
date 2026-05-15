'use client';

import { Check, ChevronRight, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';

import type { ImportWorkflowPhase } from '../types';

const LABELS = ['Upload', 'Parse', 'Normalize', 'Validate', 'Preview', 'Confirm staging'] as const;

function activeStepIndex(phase: ImportWorkflowPhase): number {
  switch (phase) {
    case 'idle':
      return 0;
    case 'reading':
    case 'parsing':
      return 1;
    case 'normalizing':
      return 2;
    case 'validating':
      return 3;
    case 'ready':
      return 4;
    case 'schema_blocked':
    case 'error':
    case 'cancelled':
    default:
      return 0;
  }
}

export interface ImportPhaseStepperProps {
  phase: ImportWorkflowPhase;
  className?: string;
}

/**
 * Read-only pipeline indicator: upload → parse → normalize → validate → preview → staging (no execution here).
 */
export function ImportPhaseStepper({ phase, className }: ImportPhaseStepperProps) {
  const active = activeStepIndex(phase);

  return (
    <nav
      className={cn('rounded-xl border border-foreground/10 bg-muted/20 px-3 py-2.5 sm:px-4', className)}
      aria-label="Import pipeline progress"
    >
      <ol className="flex flex-wrap items-center gap-y-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
        {LABELS.map((label, i) => {
          const isLast = i === LABELS.length - 1;
          const done = i < active;
          const current = i === active;
          const upcoming = i > active;
          return (
            <li key={label} className="flex items-center">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border text-[10px]',
                    done && 'border-primary/40 bg-primary/10 text-primary',
                    current && 'border-primary bg-primary/15 text-primary ring-2 ring-ring/40',
                    upcoming && 'border-border bg-background/80 text-muted-foreground',
                  )}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? <Check className="size-3" aria-hidden /> : <Circle className="size-2.5 opacity-50" aria-hidden />}
                </span>
                <span
                  className={cn(
                    done && 'text-foreground',
                    current && 'font-semibold text-foreground',
                    upcoming && 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </span>
              {!isLast && <ChevronRight className="mx-1 size-3.5 shrink-0 opacity-40 sm:mx-2" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground sm:text-xs">
        Preview and validation only — posts are not created until a future staging commit runs on the server.
      </p>
    </nav>
  );
}
