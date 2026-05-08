'use client';

import { PlatformIcon } from './PlatformIcon';
import { TWITTER_TWEET_MAX } from '../lib/platformRules';
import { PLATFORMS } from '../lib/platforms';
import type { PlatformId } from '../types';

interface CharacterCounterProps {
  content:               string;
  platforms:             PlatformId[];
  /** When X participates, aligns counters with segmented thread payloads. */
  twitterThreadSegments?: string[];
  className?:           string;
}

interface PerPlatformReading {
  id:       PlatformId;
  used:     number;
  hard:     number;
  soft:     number;
  state:    'ok' | 'near' | 'over';
  fillPct:  number;
}

function twitterThreadReading(segments: string[]): PerPlatformReading {
  const cfg     = PLATFORMS.twitter;
  const longest = segments.length ? segments.reduce((m, s) => Math.max(m, s.length), 0) : 0;
  const used        = longest;
  let state: PerPlatformReading['state'] = 'ok';
  if (used > cfg.hardLimit) state = 'over';
  else if (used > cfg.softLimit) state = 'near';
  const fillPct =
    cfg.hardLimit === 0 ? 0 : Math.min(100, (used / cfg.hardLimit) * 100);
  return { id: 'twitter', used, hard: cfg.hardLimit, soft: cfg.softLimit, state, fillPct };
}

function readingClassic(content: string, id: PlatformId): PerPlatformReading {
  const cfg                         = PLATFORMS[id];
  const used                        = content.length;
  let state: PerPlatformReading['state'] = 'ok';
  if (used > cfg.hardLimit) state = 'over';
  else if (used > cfg.softLimit) state = 'near';
  const fillPct = Math.min(100, (used / cfg.hardLimit) * 100);
  return { id, used, hard: cfg.hardLimit, soft: cfg.softLimit, state, fillPct };
}

const STATE_STYLES: Record<
  PerPlatformReading['state'],
  { ring: string; bar: string; text: string }
> = {
  ok:   { ring: 'ring-gray-200',  bar: 'bg-gray-900',  text: 'text-gray-500' },
  near: { ring: 'ring-amber-200', bar: 'bg-amber-500', text: 'text-amber-700' },
  over: { ring: 'ring-red-200',   bar: 'bg-red-600',   text: 'text-red-700' },
};

/**
 * Live, per-platform character readout — thread-aware when X participates.
 */
export function CharacterCounter({
  content,
  platforms,
  twitterThreadSegments,
  className = '',
}: CharacterCounterProps) {
  const list: PerPlatformReading[] =
    platforms.length > 0
      ? platforms.map((id) => {
          if (
            id === 'twitter'
            && twitterThreadSegments
            && twitterThreadSegments.length > 0
          )
            return twitterThreadReading(twitterThreadSegments);
          return readingClassic(content, id);
        })
      : [readingClassic(content, 'twitter')];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-xs ${className}`}
    >
      {list.map((r, idx) => {
        const cfg    = PLATFORMS[r.id];
        const styles = STATE_STYLES[r.state];
        const overBy = r.used - r.hard;
        const threaded =
          r.id === 'twitter'
          && twitterThreadSegments
          && twitterThreadSegments.length > 1;

        const title =
          threaded && twitterThreadSegments
            ? `${cfg.label} · ${twitterThreadSegments.length}-tweet thread · longest slot ${r.used}/${r.hard}`
            : `${cfg.label} · ${r.used}/${r.hard}`;

        return (
          <div
            key={`${r.id}-${idx}-${threaded ? 'thread' : 'single'}`}
            className="inline-flex flex-col gap-1"
          >
            <div className="inline-flex items-center gap-2" title={title}>
              <span aria-hidden style={{ color: cfg.brandColor }}>
                <PlatformIcon platform={r.id} size={12} />
              </span>
              <div
                className={`relative h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ${styles.ring}`}
              >
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-[width] duration-200 ${styles.bar}`}
                  style={{ width: `${r.fillPct}%` }}
                />
              </div>
              <span className={`tabular-nums font-medium ${styles.text}`}>
                {r.state === 'over' ? `−${overBy}` : `${r.used}/${r.hard}`}
              </span>
            </div>
            {threaded && (
              <p className="pl-[26px] text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {twitterThreadSegments.length}-tweet · cap {TWITTER_TWEET_MAX}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
