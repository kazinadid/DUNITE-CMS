'use client';

import { AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';

import { PlatformIcon } from './PlatformIcon';
import { PLATFORMS } from '../lib/platforms';
import type { ValidationIssue } from '../types';

interface ValidationWarningsProps {
  issues:    ValidationIssue[];
  className?: string;
}

/**
 * Inline validation banner stack; errors publish-block, warnings/recs advisory.
 */
export function ValidationWarnings({ issues, className = '' }: ValidationWarningsProps) {
  const errors   = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const recs     = issues.filter((i) => i.severity === 'recommendation');

  if (!errors.length && !warnings.length && !recs.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {errors.length > 0 && (
        <Group
          tone="error"
          icon={ShieldAlert}
          title={`${errors.length} ${errors.length === 1 ? 'issue' : 'issues'} blocking publish`}
          issues={errors}
        />
      )}
      {warnings.length > 0 && (
        <Group
          tone="warning"
          icon={AlertTriangle}
          title={`${warnings.length} platform ${warnings.length === 1 ? 'warning' : 'warnings'}`}
          issues={warnings}
        />
      )}
      {recs.length > 0 && (
        <Group
          tone="recommendation"
          icon={Sparkles}
          title={`${recs.length} publishing ${recs.length === 1 ? 'hint' : 'hints'}`}
          issues={recs}
        />
      )}
    </div>
  );
}

interface GroupProps {
  tone:   'error' | 'warning' | 'recommendation';
  title:  string;
  icon:   React.ComponentType<{ size?: number; 'aria-hidden'?: boolean; className?: string }>;
  issues: ValidationIssue[];
}

const TONES: Record<GroupProps['tone'], { wrap: string; pill: string; iconWrap: string }> = {
  error: {
    wrap:     'border-red-200/80 bg-red-50/70',
    pill:     'bg-white text-red-700 ring-red-200',
    iconWrap: 'bg-red-100 text-red-700',
  },
  warning: {
    wrap:     'border-amber-200/80 bg-amber-50/70',
    pill:     'bg-white text-amber-700 ring-amber-200',
    iconWrap: 'bg-amber-100 text-amber-700',
  },
  recommendation: {
    wrap:     'border-sky-200/80 bg-sky-50/60',
    pill:     'bg-white text-sky-700 ring-sky-200',
    iconWrap: 'bg-sky-100 text-sky-700',
  },
};

function Group({ tone, title, icon: Icon, issues }: GroupProps) {
  const t = TONES[tone];
  return (
    <div className={`rounded-xl border ${t.wrap}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${t.iconWrap}`}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <ul role="list" className="mt-1.5 space-y-1 text-sm text-gray-700">
            {issues.map((i, idx) => {
              const cfg = i.platform ? PLATFORMS[i.platform] : null;
              return (
                <li key={`${i.severity}-${idx}`} className="flex items-start gap-2">
                  {cfg && (
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${t.pill}`}
                      style={{ color: cfg.brandColor }}
                    >
                      <PlatformIcon platform={cfg.id} size={10} />
                      {cfg.shortLabel}
                    </span>
                  )}
                  <span className="flex-1 leading-snug">{i.message}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
