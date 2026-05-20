// ============================================================================
// DUNITE-CMS — Unified Facebook publish client helpers
// ----------------------------------------------------------------------------
// Thin wrappers around the existing Facebook publish/schedule API routes so
// every UI surface (composer, post card menu, post detail modal, calendar
// modal) can drive the SAME Graph-API publishing pipeline with a consistent
// confirmation flow. Backend logic lives in:
//   src/lib/social/facebook/publisher.ts        (Graph API + DB updates)
//   src/app/api/social/facebook/publish/route.ts (lock + auth + invoke)
//   src/app/api/social/facebook/schedule/route.ts (schedule + jobs RPC)
// ============================================================================

import { listSocialAccountsAction } from '@/features/integrations/server/integrationsActions';
import type { SocialAccount } from '@/features/integrations/types';

const LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Returns true when a publish lock is younger than the cron-cleanup TTL
 * (5 minutes). Older or absent locks are considered stale and ignored —
 * matching the behaviour of `cleanupStaleFacebookPublishLocks()` and the
 * publish API route's TTL check.
 */
export function isActivePublishLock(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age < LOCK_TTL_MS;
}

/** Filter the org's connected accounts down to active, healthy Facebook Pages. */
export async function loadActiveFacebookAccounts(): Promise<SocialAccount[]> {
  const res = await listSocialAccountsAction('facebook');
  if (!res.ok) {
    throw new Error(res.error || 'Failed to load Facebook accounts.');
  }
  return res.data.filter(
    (a) => a.status === 'active' && a.health_status !== 'permission_error',
  );
}

interface ApiEnvelope<T> {
  ok?:    boolean;
  error?: string;
  code?:  string;
  data?:  T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(body),
    credentials: 'include',
  });
  const raw = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !raw?.ok) {
    const msg =
      raw && typeof raw.error === 'string' && raw.error.length > 0
        ? raw.error
        : `Request to ${path} failed (${res.status}).`;
    throw new Error(msg);
  }
  return (raw.data ?? (undefined as unknown)) as T;
}

/**
 * Publish a post to Facebook immediately.
 *
 * Server side:
 *   1. Auth + org gate.
 *   2. Lock the post (5-minute TTL — does NOT inspect status, so stale locks
 *      from a crashed publisher are auto-recovered).
 *   3. Call `publishFacebookPost()` which posts to Graph API and updates
 *      `posts.status='published'`, `external_post_id`, `published_at`,
 *      `published_by`, and `publish_metadata`.
 */
export function publishToFacebook(
  postId: string,
  socialAccountId: string,
): Promise<unknown> {
  return postJson('/api/social/facebook/publish', { postId, socialAccountId });
}

/**
 * Schedule a Facebook post by registering CMS schedule + a publishing_jobs row.
 * Cron at `/api/cron/publish-scheduled` later picks the job up and publishes.
 */
export function scheduleOnFacebook(
  postId: string,
  socialAccountId: string,
  scheduledFor: string,
): Promise<unknown> {
  return postJson('/api/social/facebook/schedule', {
    postId,
    socialAccountId,
    scheduledFor,
  });
}

/** Pretty label for an account in selectors and confirmation dialogs. */
export function describeAccount(account: SocialAccount | null | undefined): string {
  if (!account) return 'Not selected';
  return account.external_name ?? account.page_name ?? account.external_id ?? 'Unknown Page';
}
