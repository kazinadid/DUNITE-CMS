'use client';

import { PlatformIcon } from './PlatformIcon';
import { PLATFORMS } from '../lib/platforms';
import type { PlatformId } from '../types';

interface CharacterCounterProps {
  content:   string;
  platforms: PlatformId[];
  className?: string;
}

interface PerPlatformReading {
  id:       PlatformId;
  used:     number;
  hard:     number;
  soft:     number;
  state:    'ok' | 'near' | 'over';
  /** What % of the bar to fill (capped at 100). */
  fillPct:  number;
}

function readingFor(content: string, id: PlatformId): PerPlatformReading {
  const cfg = PLATFORMS[id];
  const used = content.length;
  let state: PerPlatformReading['state'] = 'ok';
  if (used > cfg.hardLimit)        state = 'over';
  else if (used > cfg.softLimit)   state = 'near';
  const fillPct = Math.min(100, (used / cfg.hardLimit) * 100);
  return { id, used, hard: cfg.hardLimit, soft: cfg.softLimit, state, fillPct };
}

const STATE_STYLES: Record<PerPlatformReading['state'], { ring: string; bar: string; text: string }> = {
  ok:   { ring: 'ring-gray-200',   bar: 'bg-gray-900',  text: 'text-gray-500'   },
  near: { ring: 'ring-amber-200',  bar: 'bg-amber-500', text: 'text-amber-700'  },
  over: { ring: 'ring-red-200',    bar: 'bg-red-600',   text: 'text-red-700'    },
};

/**
 * Live, per-platform character readout. When no platform is selected we
 * still show a generic counter against the tightest known limit (Twitter)
 * so the user is never flying blind.
 */
export function CharacterCounter({
  content,
  platforms,
  className = '',
}: CharacterCounterProps) {
  const list = platforms.length > 0
    ? platforms.map((id) => readingFor(content, id))
    : [readingFor(content, 'twitter')];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-xs ${className}`}
    >
      {list.map((r) => {
        const cfg = PLATFORMS[r.id];
        const styles = STATE_STYLES[r.state];
        const overBy = r.used - r.hard;
        return (
          <div
            key={r.id}
            className="inline-flex items-center gap-2"
            title={`${cfg.label} · ${r.used} / ${r.hard}`}
          >
            <span
              aria-hidden
              className="text-gray-500"
              style={{ color: cfg.brandColor }}
            >
              <PlatformIcon platform={r.id} size={12} />
            </span>
            <div className={`relative h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ${styles.ring}`}>
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-[width] ${styles.bar}`}
                style={{ width: `${r.fillPct}%` }}
              />
            </div>
            <span className={`tabular-nums font-medium ${styles.text}`}>
              {r.state === 'over' ? `−${overBy}` : `${r.used}/${r.hard}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
