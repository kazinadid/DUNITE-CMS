/**
 * Canonical Facebook Analytics sync primitives (Graph fetchers, Postgres queue orchestration).
 */
export { fetchPostInsights, fetchPageInsights } from './fetchInsights';
export { calculateDerivedMetrics } from './derivedMetrics';
export { syncPostAnalytics, executePostAnalyticsSync } from './syncPostAnalytics';
export { syncPageAnalytics, executePageAnalyticsSync } from './syncPageAnalytics';
export {
  batchSyncOrganizationAnalytics,
  processFacebookAnalyticsQueueDrain,
  recoverFacebookAnalyticsStalePostsDb,
} from './queueWorker';
export { auditFacebookTokenExpiredIfNeeded, markPostAnalyticsState } from './markPostAnalyticsState';
export {
  errorSummaryFromUnknown,
  normalizeThrownError,
} from './normalizeThrownError';
export { countConnectedFacebookAccounts } from './facebookIntegrationPreflight';
