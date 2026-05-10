import { PLATFORM_ORDER, PLATFORMS } from '@/features/composer/lib/platforms';
import type { PlatformId } from '@/features/composer/types';

const ALIASES: Record<string, PlatformId> = {
  twitter: 'twitter',
  x: 'twitter',
  'twitter/x': 'twitter',
  tw: 'twitter',
  instagram: 'instagram',
  ig: 'instagram',
  linkedin: 'linkedin',
  li: 'linkedin',
  facebook: 'facebook',
  fb: 'facebook',
};

/**
 * Parse comma / semicolon / pipe separated platform tokens.
 */
export function parsePlatforms(raw: string): { platforms: PlatformId[]; unknown: string[] } {
  const parts = raw
    .split(/[,;|]/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<PlatformId>();
  const unknown: string[] = [];

  for (const p of parts) {
    const key = p.toLowerCase().replace(/\s+/g, '_');
    const low = p.toLowerCase() as PlatformId;
    const id =
      ALIASES[key] ?? (PLATFORM_ORDER.includes(low) ? low : null);
    if (id && PLATFORMS[id]) {
      seen.add(id);
    } else {
      unknown.push(p);
    }
  }

  return { platforms: Array.from(seen), unknown };
}

/**
 * Split URLs from newline, comma, pipe, or whitespace for well-formed http(s).
 */
export function parseMediaUrls(raw: string): string[] {
  if (!raw.trim()) return [];
  const chunks = raw.split(/[\n\r,|]+/g).flatMap((c) => c.split(/\s+/g));
  const out: string[] = [];
  const seen = new Set<string>();

  for (let c of chunks) {
    c = c.trim();
    if (!c) continue;
    let u = c;
    if (!/^https?:\/\//i.test(u)) {
      if (u.startsWith('//')) u = `https:${u}`;
    }
    try {
      const url = new URL(u);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const s = url.toString();
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/**
 * Parse comma or space separated hashtags; strips leading `#`.
 */
export function parseHashtags(raw: string): string[] {
  if (!raw.trim()) return [];
  const parts = raw.split(/[,]+|\s+/g).map((p) => p.replace(/^#+/, '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p.toLowerCase();
    if (!seen.has(t)) {
      seen.add(t);
      out.push(p);
    }
  }
  return out;
}
