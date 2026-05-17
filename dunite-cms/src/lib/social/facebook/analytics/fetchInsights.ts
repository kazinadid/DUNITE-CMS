import 'server-only';

import {
  fetchPageInsightsBundle,
  fetchPostInsightsBundle,
} from '@/lib/social/facebook/insights/fetcher';
import type { NormalizedPostMetrics } from '@/lib/social/facebook/insights/transformer';
import { withFacebookInsightsRetry } from './graphRetry';

export async function fetchPostInsights(opts: {
  socialAccountId: string;
  externalPostId: string;
}): Promise<NormalizedPostMetrics> {
  return withFacebookInsightsRetry(
    'post_insights_bundle',
    () => fetchPostInsightsBundle(opts),
    { maxAttempts: 3 },
  );
}

export async function fetchPageInsights(opts: {
  socialAccountId: string;
  pageExternalId: string;
}): Promise<{ metrics: NormalizedPostMetrics; raw: Record<string, unknown> }> {
  return withFacebookInsightsRetry(
    'page_insights_bundle',
    () => fetchPageInsightsBundle(opts),
    { maxAttempts: 3 },
  );
}
