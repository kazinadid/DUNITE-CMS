import 'server-only';

const LINKEDIN_HOURLY_LIMIT = Number(process.env.LINKEDIN_RATE_LIMIT_PER_HOUR) || 200;

// In-memory rate tracking (will be replaced with Redis/DB in production)
const linkedinCallTracker = new Map<string, { count: number; resetAt: number }>();

function getTrackerKey(organizationId: string): string {
  const hour = Math.floor(Date.now() / (60 * 60 * 1000));
  return `${organizationId}:${hour}`;
}

/**
 * Check if an organization has remaining LinkedIn API budget.
 * Returns true if allowed, false if rate limited.
 */
export function allowLinkedInAPICall(organizationId: string): boolean {
  const key = getTrackerKey(organizationId);
  const tracker = linkedinCallTracker.get(key);

  if (!tracker) {
    // First call this hour
    linkedinCallTracker.set(key, { count: 1, resetAt: Date.now() + 60 * 60 * 1000 });
    return true;
  }

  if (Date.now() > tracker.resetAt) {
    // Reset for new hour
    linkedinCallTracker.set(key, { count: 1, resetAt: Date.now() + 60 * 60 * 1000 });
    return true;
  }

  if (tracker.count >= LINKEDIN_HOURLY_LIMIT) {
    return false;
  }

  tracker.count += 1;
  return true;
}

/**
 * Get remaining API calls for an organization.
 */
export function getLinkedInRemainingCalls(organizationId: string): number {
  const key = getTrackerKey(organizationId);
  const tracker = linkedinCallTracker.get(key);

  if (!tracker || Date.now() > tracker.resetAt) {
    return LINKEDIN_HOURLY_LIMIT;
  }

  return Math.max(0, LINKEDIN_HOURLY_LIMIT - tracker.count);
}
