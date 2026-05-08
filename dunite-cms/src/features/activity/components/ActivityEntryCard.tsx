'use client';

import { memo } from 'react';

import { PlatformIcon } from '@/features/composer';
import type { PlatformId } from '@/features/composer/types';
import { cn } from '@/lib/utils';

import {
  activityActionIcon,
  activityActionTone,
  activityToneClasses,
  formatActivityActionLabel,
} from '../activityVisual';
import { formatAbsolute } from '@/features/posts/lib/relativeTime';
import type { ActivityLog } from '../types';

function parsePlatform(raw: unknown): PlatformId | null {
  if (typeof raw !== 'string') return null;
  const p = raw.toLowerCase().trim();
  if (p === 'facebook' || p === 'instagram' || p === 'linkedin' || p === 'twitter') {
    return p;
  }
  return null;
}

export interface ActivityEntryCardProps {
  entry:    ActivityLog;
  compact?: boolean;
  className?: string;
}

function ActivityEntryCardImpl({ entry, compact, className }: ActivityEntryCardProps) {
  const tone   = activityActionTone(entry.action_type);
  const Icon   = activityActionIcon(entry.action_type);
  const actor  = entry.actor;
  const label  =
    actor?.name?.trim() ||
    actor?.email?.split('@')[0] ||
    (entry.user_id ? `User ${entry.user_id.slice(0, 8)}…` : 'System');
  const platform = parsePlatform(entry.metadata?.platform);

  return (
    <article
      className={cn(
        'relative flex gap-3 rounded-xl border border-gray-100/90 bg-white/95 p-3 shadow-sm ring-1 ring-black/[0.03] transition hover:border-gray-200/90',
        compact && 'p-2.5',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
          activityToneClasses(tone),
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {formatActivityActionLabel(entry.action_type)}
          </span>
          {platform ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-md bg-gray-50 px-1.5 py-0.5 ring-1 ring-gray-200/70"
              title={platform}
            >
              <PlatformIcon platform={platform} size={11} />
            </span>
          ) : null}
          <span className="ml-auto font-mono text-[10px] tabular-nums text-gray-400">
            {formatAbsolute(entry.created_at)}
          </span>
        </div>
        <p className="text-sm leading-snug text-gray-900">{entry.message}</p>
        <p className="text-[11px] text-gray-500">
          <span className="font-medium text-gray-700">{label}</span>
          {entry.entity_type ? (
            <>
              <span aria-hidden> · </span>
              <span className="capitalize">{entry.entity_type.replace(/_/g, ' ')}</span>
            </>
          ) : null}
        </p>
        {entry.metadata && Object.keys(entry.metadata).length > 0 && !compact ? (
          <details className="group mt-1">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-[#7A0000]/90 hover:underline">
              Details
            </summary>
            <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-gray-950/90 p-2 text-[10px] leading-relaxed text-emerald-100/90">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export const ActivityEntryCard = memo(ActivityEntryCardImpl);
