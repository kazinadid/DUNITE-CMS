import 'server-only';

import type { PlatformId } from '@/features/composer/types';

const PLATFORM_ALIAS: Record<string, PlatformId> = {
  facebook: 'facebook',
  fb: 'facebook',
  instagram: 'instagram',
  ig: 'instagram',
  linkedin: 'linkedin',
  li: 'linkedin',
  twitter: 'twitter',
  x: 'twitter',
  'twitter/x': 'twitter',
  tw: 'twitter',
  xcom: 'twitter',
};

const HASHTAG_TOKEN = /#([A-Za-z0-9_]{1,64})/g;

export function normalizePlatformTokens(input: unknown): {
  platforms: PlatformId[];
  unknownTokens: string[];
} {
  const rawTokens = Array.isArray(input)
    ? input.map((x) => String(x ?? '').trim()).filter(Boolean)
    : typeof input === 'string'
      ? input
          .split(/[,;|]/g)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

  const dedupe = new Set<PlatformId>();
  const unknown: string[] = [];

  for (const token of rawTokens) {
    const normalized = token
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[._-]/g, '');
    const mapped = PLATFORM_ALIAS[normalized] ?? null;
    if (!mapped) {
      unknown.push(token);
      continue;
    }
    dedupe.add(mapped);
  }

  return {
    platforms: Array.from(dedupe),
    unknownTokens: unknown,
  };
}

function normalizeHashtagToken(token: string): string | null {
  const cleaned = token.replace(/^#+/, '').trim().toLowerCase();
  if (!cleaned) return null;
  if (!/^[a-z0-9_]{1,64}$/.test(cleaned)) return null;
  return cleaned;
}

function extractInlineHashtags(content: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null = HASHTAG_TOKEN.exec(content);
  while (m) {
    const t = normalizeHashtagToken(m[1] ?? '');
    if (t) out.push(t);
    m = HASHTAG_TOKEN.exec(content);
  }
  HASHTAG_TOKEN.lastIndex = 0;
  return out;
}

export function normalizeHashtags(input: unknown, content: string): string[] {
  const fromInput = Array.isArray(input)
    ? input.map((x) => String(x ?? ''))
    : typeof input === 'string'
      ? input.split(/[,;\s]+/g)
      : [];
  const inline = extractInlineHashtags(content);
  const dedupe = new Set<string>();
  const ordered: string[] = [];

  for (const token of [...fromInput, ...inline]) {
    const norm = normalizeHashtagToken(token);
    if (!norm || dedupe.has(norm)) continue;
    dedupe.add(norm);
    ordered.push(norm);
  }
  return ordered;
}

export function mergeContentWithHashtags(content: string, hashtags: string[]): string {
  if (hashtags.length === 0) return content.trim();
  const missing = hashtags.filter((tag) => !new RegExp(`(^|\\s)#${tag}(\\b|$)`, 'i').test(content));
  if (missing.length === 0) return content.trim();
  const suffix = missing.map((t) => `#${t}`).join(' ');
  const merged = `${content.trim()} ${suffix}`.trim();
  return merged.slice(0, 100_000);
}

export function normalizeMediaUrls(input: unknown): string[] {
  const rawParts = Array.isArray(input)
    ? input.map((x) => String(x ?? ''))
    : typeof input === 'string'
      ? input.split(/[\n\r,;|\s]+/g)
      : [];

  const dedupe = new Set<string>();
  const out: string[] = [];
  for (const part of rawParts) {
    const token = part.trim();
    if (!token) continue;
    const withProtocol = /^https?:\/\//i.test(token)
      ? token
      : token.startsWith('//')
        ? `https:${token}`
        : token;
    try {
      const parsed = new URL(withProtocol);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      const url = parsed.toString();
      if (dedupe.has(url)) continue;
      dedupe.add(url);
      out.push(url);
    } catch {
      // ignore malformed URL tokens
    }
  }
  return out;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'other';

export function inferMediaKindFromUrl(url: string): MediaKind {
  const clean = url.toLowerCase().split('?')[0]?.split('#')[0] ?? '';
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(clean)) return 'image';
  if (/\.(mp4|mov|avi|mkv|webm|m4v)$/.test(clean)) return 'video';
  if (/\.(mp3|wav|aac|ogg|m4a)$/.test(clean)) return 'audio';
  return 'other';
}

export function inferMimeFromUrl(url: string): string | null {
  const clean = url.toLowerCase().split('?')[0]?.split('#')[0] ?? '';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.mp4')) return 'video/mp4';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mp3')) return 'audio/mpeg';
  if (clean.endsWith('.wav')) return 'audio/wav';
  return null;
}

export function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    const tail = pathname.split('/').pop() ?? '';
    return tail || 'import-media';
  } catch {
    return 'import-media';
  }
}
