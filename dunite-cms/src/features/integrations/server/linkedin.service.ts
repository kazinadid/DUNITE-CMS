// ============================================================================
// DUNITE CMS — LinkedIn OAuth + API service
// ============================================================================
// Server-only service. Owns LinkedIn API calls, OAuth flow, token exchange,
// organization fetching, secure token encryption, and OAuth selection payloads.
// ============================================================================

import 'server-only';

import type { OAuthStateMetadata, PendingLinkedInOrganization } from '../types';
import {
  buildLinkedInOAuthUrl,
  exchangeLinkedInCode,
  getLinkedInProfile,
  getLinkedInOrganizations,
  prepareOAuthSelectionMetadata as _prepareOAuthSelectionMetadata,
} from '@/lib/social/linkedin/oauth';
import { encryptToken } from '../lib/encryption';
import { computeExpiresAt, computeTokenType } from '../lib/tokenManager';

export { buildLinkedInOAuthUrl };

export function getLinkedInRedirectUri(): string {
  return (
    process.env.LINKEDIN_REDIRECT_URI ||
    'http://localhost:3000/api/integrations/linkedin/callback'
  );
}

function getLinkedInEnv() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn Client ID or Client Secret is missing.');
  }

  return { clientId, clientSecret, redirectUri: getLinkedInRedirectUri() };
}

export function getLinkedInScopes(): string[] {
  const raw = process.env.LINKEDIN_SCOPES;
  if (!raw) {
    return ['openid', 'profile', 'email', 'w_member_social'];
  }
  return raw.split(' ').filter(Boolean);
}

/**
 * After OAuth callback: exchange code → access token, fetch profile + organizations,
 * encrypt tokens, return metadata stored on oauth_states until the user picks orgs.
 */
export async function prepareOAuthSelectionMetadata(code: string): Promise<{
  linkedinMemberId: string;
  metadata: OAuthStateMetadata;
}> {
  return _prepareOAuthSelectionMetadata(code);
}

/** Re-export for diagnostics */
export { getLinkedInOrganizations, getLinkedInProfile, exchangeLinkedInCode };
