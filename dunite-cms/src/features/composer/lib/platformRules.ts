import type { PlatformId } from '../types';

/** Hard character cap for a single X post (threads use one cap per tweet). */
export const TWITTER_TWEET_MAX = 280;

/** Typical reel / Stories-style vertical (~9:16, width ÷ height). */
export const REEL_ASPECT_RATIO = 9 / 16;

/** Feed guidance for Instagram approximate width÷height bounds. */
export const INSTAGRAM_FEED_ASPECT = { min: 0.75, max: 1.92 } as const;

export interface BytesAndMediaRules {
  /** Max uncompressed image payload per attachment (warn). */
  maxImageBytes: number;
  /** Max video file size (warn). */
  maxVideoBytes: number;
}

export const PLATFORM_BYTES_RULES: Record<PlatformId, BytesAndMediaRules> = {
  twitter: {
    maxImageBytes: 5 * 1024 * 1024,
    maxVideoBytes: 512 * 1024 * 1024,
  },
  instagram: {
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
  },
  linkedin: {
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 500 * 1024 * 1024,
  },
  facebook: {
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
  },
};

/** When no platform chosen — conservative guardrails */
export function tightestMediaByteCaps(platforms: PlatformId[]): BytesAndMediaRules {
  if (platforms.length === 0) return PLATFORM_BYTES_RULES.twitter;
  return platforms.reduce(
    (acc, p) => {
      const r = PLATFORM_BYTES_RULES[p];
      return {
        maxImageBytes: Math.min(acc.maxImageBytes, r.maxImageBytes),
        maxVideoBytes: Math.min(acc.maxVideoBytes, r.maxVideoBytes),
      };
    },
    PLATFORM_BYTES_RULES[platforms[0]!],
  );
}
