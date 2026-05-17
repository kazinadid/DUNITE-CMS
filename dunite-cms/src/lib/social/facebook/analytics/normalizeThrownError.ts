import 'server-only';

/**
 * PostgREST failures from `@supabase/postgrest-js` are POJOs, not `instanceof Error`.
 * Re-throwing them breaks `catch (e) { e instanceof Error }` and hides messages in APIs.
 */

export interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Coerce unknown throws into `Error` with a useful `.message`. */
export function normalizeThrownError(caught: unknown): Error {
  if (caught instanceof Error) return caught;
  if (typeof caught === 'string' && caught.trim())
    return new Error(caught.trim());
  if (caught != null && typeof caught === 'object') {
    const o = caught as PostgrestLikeError;
    const chunks: string[] = [];
    if (typeof o.message === 'string' && o.message.trim()) chunks.push(o.message.trim());
    if (typeof o.details === 'string' && o.details.trim()) chunks.push(o.details.trim());
    if (typeof o.hint === 'string' && o.hint.trim()) chunks.push(o.hint.trim());
    if (typeof o.code === 'string' && o.code.trim()) chunks.push(`code=${o.code.trim()}`);
    if (chunks.length) return new Error(chunks.join(' — '));
  }
  try {
    const s = JSON.stringify(caught);
    if (s && s !== '{}') return new Error(s.slice(0, 2000));
  } catch {
    /* fall through */
  }
  return new Error('Facebook analytics sync encountered an unrecognized failure.');
}

/** Safe textual summary for Postgres `analytics_sync_logs.error_summary`. */
export function errorSummaryFromUnknown(caught: unknown, maxLen = 2000): string {
  const msg = normalizeThrownError(caught).message;
  if (msg.length <= maxLen) return msg;
  return `${msg.slice(0, maxLen)}…`;
}
