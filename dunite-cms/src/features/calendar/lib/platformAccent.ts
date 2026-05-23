/**
 * Calendar-only palette (content planner). Per brief: Facebook blue, Instagram
 * purple gradient feel, LinkedIn cyan, X dark.
 */

import type { PlatformId } from '@/features/composer/types';

export const CALENDAR_PLATFORM_DOT: Record<string, string> = {
  facebook:  '#1877F2',
  instagram: '#9333EA',
  linkedin:  '#0A66C2',
  twitter:   '#0F1419',
};

const FALLBACK = '#6B7280';

function normalizePlatform(p: string | undefined): string {
  return (p ?? '').toLowerCase().trim();
}

export function gradientStops(platforms: string[]): string[] {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const raw of platforms) {
    const k = normalizePlatform(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const c = CALENDAR_PLATFORM_DOT[k] ?? FALLBACK;
    uniq.push(c);
  }
  if (uniq.length === 0) return [FALLBACK];
  return uniq;
}

/** Icon-well chrome for stacked platform glyphs inside planner tiles. */
export const CALENDAR_PLATFORM_CHROME: Record<
  PlatformId,
  string
> = {
  facebook:
    'bg-[#1877F2]/12 text-[#1877F2] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-[#1877F2]/28',
  instagram:
    'bg-gradient-to-br from-[#7C4DFF]/18 via-[#C026D3]/12 to-[#FB2775]/14 text-[#86198f] shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] ring-1 ring-purple-400/35',
  linkedin:
    'bg-[#0A66C2]/12 text-[#0A66C2] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] ring-1 ring-[#0A66C2]/30',
  twitter:
    'bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-zinc-700/65',
};
