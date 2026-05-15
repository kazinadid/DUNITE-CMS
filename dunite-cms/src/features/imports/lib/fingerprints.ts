/**
 * Deterministic fingerprints for client-side duplicate detection.
 * Server-side import_job_mark_duplicates_* can extend with the same keys later.
 */

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function normalizeWhitespaceForContent(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function fingerprintContent(postText: string): string {
  return djb2(normalizeWhitespaceForContent(postText));
}

export function fingerprintMediaUrls(urls: readonly string[]): string {
  const sorted = [...urls].map((u) => u.trim().toLowerCase()).filter(Boolean).sort();
  return djb2(sorted.join('|'));
}

export function fingerprintScheduleAndContent(publishAt: Date | null, contentFp: string): string {
  if (!publishAt) return `${contentFp}|noschedule`;
  const minute = Math.floor(publishAt.getTime() / 60000);
  return djb2(`${contentFp}|${minute}`);
}
