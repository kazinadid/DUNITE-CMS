/**
 * TZ debug ingest is dev-only by default (`NODE_ENV === 'development'`).
 * For `next start` / staging-like bundles where the client sees `production`,
 * set `.env.local`:
 * - `DUNITE_TZ_DEBUG=1` (server: `/api/debug/tz-ingest` accepts POST/GET + disk writes)
 * - `NEXT_PUBLIC_DUNITE_TZ_DEBUG=1` (browser: EXPORT-BUNDLE scheduling, unload beacon, ingest fan-out)
 */

export function isTzDebugRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development'
    || process.env.DUNITE_TZ_DEBUG === '1'
  );
}

/** Client bundles: use `NEXT_PUBLIC_*` — `DUNITE_TZ_DEBUG` is not inlined there. */
export function isTzDebugClientHooksEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development'
    || process.env.NEXT_PUBLIC_DUNITE_TZ_DEBUG === '1'
  );
}
