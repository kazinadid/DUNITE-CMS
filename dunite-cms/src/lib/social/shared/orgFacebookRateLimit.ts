import 'server-only';

const WINDOW_MS = 60 * 60 * 1000;

function hourlyLimit(): number {
  const raw = process.env.FACEBOOK_RATE_LIMIT_PER_HOUR;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(2000, Math.max(10, n)) : 200;
}

const timestampsByOrg = new Map<string, number[]>();

/** Best-effort in-process hourly cap (~200/Page spec uses per-page — we scope per org aggregate). */
export function allowFacebookGraphCall(orgId: string): boolean {
  const now = Date.now();
  const lim = hourlyLimit();
  const windowStart = now - WINDOW_MS;

  const cur = timestampsByOrg.get(orgId) ?? [];
  const fresh = cur.filter((t) => t > windowStart);
  if (fresh.length >= lim) {
    timestampsByOrg.set(orgId, fresh);
    return false;
  }
  fresh.push(now);
  timestampsByOrg.set(orgId, fresh);
  return true;
}
