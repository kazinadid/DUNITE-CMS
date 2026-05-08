import type { LibraryMediaRow } from '../types';

export const COMPOSER_MEDIA_REUSE_STORAGE_KEY = 'dunite:composer-media-reuse-v1';

/** Minimal payload for hydration as `library_ref` in Composer. */
export type ComposerMediaReusePayload = Pick<
  LibraryMediaRow,
  | 'id'
  | 'file_url'
  | 'file_type'
  | 'file_name'
  | 'mime_type'
  | 'size'
  | 'storage_path'
  | 'thumbnail_url'
  | 'thumbnail_path'
>;

function safeParse(raw: string | null): ComposerMediaReusePayload[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is ComposerMediaReusePayload =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as ComposerMediaReusePayload).id === 'string' &&
        typeof (x as ComposerMediaReusePayload).file_url === 'string' &&
        typeof (x as ComposerMediaReusePayload).storage_path === 'string',
    );
  } catch {
    return [];
  }
}

export function enqueueComposerMediaReuse(rows: ComposerMediaReusePayload[]): void {
  if (typeof window === 'undefined' || rows.length === 0) return;
  const prev = safeParse(sessionStorage.getItem(COMPOSER_MEDIA_REUSE_STORAGE_KEY));
  const byId = new Map<string, ComposerMediaReusePayload>();
  for (const r of prev) byId.set(r.id, r);
  for (const r of rows) byId.set(r.id, r);
  sessionStorage.setItem(
    COMPOSER_MEDIA_REUSE_STORAGE_KEY,
    JSON.stringify(Array.from(byId.values())),
  );
}

/**
 * Read and clear the pending reuse queue (call once on Composer mount).
 */
export function consumeComposerMediaReuse(): ComposerMediaReusePayload[] {
  if (typeof window === 'undefined') return [];
  const raw = sessionStorage.getItem(COMPOSER_MEDIA_REUSE_STORAGE_KEY);
  sessionStorage.removeItem(COMPOSER_MEDIA_REUSE_STORAGE_KEY);
  return safeParse(raw);
}

/** Expand minimal reuse payloads into rows accepted by Composer pick handler. */
export function reusePayloadAsLibraryRows(
  payloads: ComposerMediaReusePayload[],
): LibraryMediaRow[] {
  const now = new Date().toISOString();
  return payloads.map((p) => ({
    id:             p.id,
    post_id:        null,
    user_id:        null,
    file_url:       p.file_url,
    file_type:      p.file_type,
    file_name:      p.file_name,
    mime_type:      p.mime_type,
    size:           p.size,
    storage_path:   p.storage_path,
    order_index:    0,
    created_at:     now,
    category_id:    null,
    thumbnail_url:  p.thumbnail_url,
    thumbnail_path: p.thumbnail_path,
    is_library:     true,
    width_px:       null,
    height_px:      null,
  }));
}