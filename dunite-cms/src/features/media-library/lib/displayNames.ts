import type { LibraryMediaRow } from '../types';

export function uploaderDisplayName(row: LibraryMediaRow): string {
  const raw = row.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  if (!u) return 'Unknown';
  const n = (u.name ?? '').trim();
  if (n) return n;
  const local = u.email.split('@')[0];
  return local || 'Unknown';
}
