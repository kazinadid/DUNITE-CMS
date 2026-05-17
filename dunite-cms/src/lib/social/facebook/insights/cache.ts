import type { DashboardAnalytics } from '@/lib/social/facebook/insights/types';

interface CacheEnvelope<T> {
  expiresAt: number;
  value: T;
}

const dashboardCache = new Map<string, CacheEnvelope<DashboardAnalytics>>();

const TTL_MS_DEFAULT = Number(
  process.env.FACEBOOK_ANALYTICS_CACHE_MS ?? `${120 * 1000}`,
);

function cacheKey(parts: Record<string, string>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

export function getAnalyticsDashboardCached(params: {
  organizationId: string;
  queryToken: string;
}): DashboardAnalytics | null {
  const key = cacheKey({ org: params.organizationId, q: params.queryToken });
  const hit = dashboardCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    dashboardCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setAnalyticsDashboardCached(
  params: {
    organizationId: string;
    queryToken: string;
  },
  value: DashboardAnalytics,
  ttlMs = TTL_MS_DEFAULT,
): void {
  const key = cacheKey({ org: params.organizationId, q: params.queryToken });
  dashboardCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function refreshAnalyticsCache(organizationId: string): void {
  const prefixKeyPart = `${encodeURIComponent('org')}=${encodeURIComponent(organizationId)}`;
  for (const k of dashboardCache.keys()) {
    if (k.startsWith(`${encodeURIComponent('org')}=${encodeURIComponent(organizationId)}`)) {
      dashboardCache.delete(k);
    }
  }
  /** prefixKeyPart avoids unused-variable lint while leaving room for future metrics */
  void prefixKeyPart;
}
