/**
 * Canonical derived metrics shared by sync pipeline + dashboards.
 */

export interface MetricInputs {
  engagements: number;
  reach: number;
  impressions: number;
  link_clicks?: number | undefined;
  /** Non-link clicks surrogate when link_clicks missing */
  clicks?: number | undefined;
}

export interface DerivedRates {
  engagement_rate: number | null;
  ctr: number | null;
}

/** engagement_rate := engagements/reach · 100; ctr := link_or_clicks/impressions · 100 */
export function calculateDerivedMetrics(input: MetricInputs): DerivedRates {
  const reach = Math.max(0, Number(input.reach) || 0);
  const impressions = Math.max(0, Number(input.impressions) || 0);
  const engagements = Math.max(0, Number(input.engagements) || 0);
  const link = input.link_clicks ?? input.clicks ?? 0;

  const engagement_rate =
    reach > 0 ? Number(((engagements / reach) * 100).toFixed(6)) : null;

  const ctr =
    impressions > 0 ? Number((((Number(link) || 0) / impressions) * 100).toFixed(6)) : null;

  return { engagement_rate, ctr };
}
