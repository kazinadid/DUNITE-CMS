// ============================================================================
// DUNITE CMS — Token lifecycle manager
// ============================================================================
// Handles token expiry detection, refresh workflows, and rotation logic.
// Server-side only.
// ============================================================================

import type { SocialAccount, AccountHealthStatus, TokenType } from '../types';
import { exchangeForLongLivedToken, debugToken } from './facebookClient';
import { encryptToken, decryptToken } from './encryption';

// ── Expiry thresholds ─────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 7;   // Show warning when < 7 days remain
const EXPIRY_CRITICAL_DAYS = 1;  // Mark expired-soon when < 1 day remains

// ── Token health analysis ─────────────────────────────────────────────────────

export interface TokenHealthInfo {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number | null;
  healthStatus: AccountHealthStatus;
  requiresReconnect: boolean;
}

/**
 * Compute token health purely from stored metadata (no API calls).
 */
export function analyzeTokenHealth(account: SocialAccount): TokenHealthInfo {
  if (account.token_type === 'never_expires' || !account.token_expires_at) {
    return {
      isExpired:        false,
      isExpiringSoon:   false,
      daysRemaining:    null,
      healthStatus:     'healthy',
      requiresReconnect: false,
    };
  }

  const expiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();
  const msDiff = expiresAt - now;
  const daysRemaining = Math.floor(msDiff / (1000 * 60 * 60 * 24));

  if (msDiff <= 0) {
    return {
      isExpired:        true,
      isExpiringSoon:   false,
      daysRemaining:    0,
      healthStatus:     'expired',
      requiresReconnect: true,
    };
  }

  if (daysRemaining <= EXPIRY_CRITICAL_DAYS) {
    return {
      isExpired:        false,
      isExpiringSoon:   true,
      daysRemaining,
      healthStatus:     'expired',
      requiresReconnect: true,
    };
  }

  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return {
      isExpired:        false,
      isExpiringSoon:   true,
      daysRemaining,
      healthStatus:     'warning',
      requiresReconnect: false,
    };
  }

  return {
    isExpired:        false,
    isExpiringSoon:   false,
    daysRemaining,
    healthStatus:     'healthy',
    requiresReconnect: false,
  };
}

// ── Facebook long-lived token refresh ────────────────────────────────────────

export interface RefreshResult {
  encryptedToken: string;
  expiresAt: Date;
  tokenType: TokenType;
  issuedAt: Date;
}

/**
 * Attempt to refresh a Facebook long-lived user token.
 * Facebook tokens can be "refreshed" by exchanging them again before they expire.
 * Returns the new encrypted token + expiry info.
 *
 * @throws if the existing token is too old or already expired
 */
export async function refreshFacebookToken(
  encryptedUserToken: string,
): Promise<RefreshResult> {
  let currentToken: string;
  try {
    currentToken = decryptToken(encryptedUserToken);
  } catch {
    throw new Error('[tokenManager] Cannot decrypt token for refresh — reconnect required.');
  }

  const refreshed = await exchangeForLongLivedToken(currentToken);

  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  return {
    encryptedToken: encryptToken(refreshed.access_token),
    expiresAt,
    tokenType:      'long_lived',
    issuedAt,
  };
}

// ── Token metadata derivation ─────────────────────────────────────────────────

/**
 * Compute the expiry date from an `expires_in` seconds value returned by Facebook.
 * Returns null if expires_in is 0 (which Facebook returns for never-expiring tokens).
 */
export function computeExpiresAt(expiresInSeconds: number): Date | null {
  if (expiresInSeconds === 0) return null;
  return new Date(Date.now() + expiresInSeconds * 1000);
}

export function computeTokenType(expiresInSeconds: number): TokenType {
  if (expiresInSeconds === 0)          return 'never_expires';
  if (expiresInSeconds > 3600 * 24)    return 'long_lived';
  return 'short_lived';
}

// ── Debug token → health resolution ──────────────────────────────────────────

/**
 * Use Graph API's /debug_token to validate a decrypted token and return
 * a structured health summary. Used during background validation jobs.
 */
export async function resolveTokenHealthViaApi(
  decryptedToken: string,
  requiredScopes: string[],
): Promise<{
  isValid: boolean;
  healthStatus: AccountHealthStatus;
  grantedScopes: string[];
  missingScopes: string[];
  expiresAt: Date | null;
}> {
  let debug: Awaited<ReturnType<typeof debugToken>>;
  try {
    debug = await debugToken(decryptedToken);
  } catch {
    return {
      isValid:       false,
      healthStatus:  'disconnected',
      grantedScopes: [],
      missingScopes: requiredScopes,
      expiresAt:     null,
    };
  }

  if (!debug.is_valid || debug.error) {
    return {
      isValid:       false,
      healthStatus:  'expired',
      grantedScopes: [],
      missingScopes: requiredScopes,
      expiresAt:     null,
    };
  }

  const grantedScopes = debug.scopes ?? [];
  const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
  const expiresAt     = debug.expires_at ? new Date(debug.expires_at * 1000) : null;

  let healthStatus: AccountHealthStatus = 'healthy';
  if (missingScopes.length > 0)                    healthStatus = 'permission_error';
  else if (expiresAt && expiresAt < new Date())     healthStatus = 'expired';
  else if (expiresAt) {
    const days = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (days < EXPIRY_WARNING_DAYS)                 healthStatus = 'warning';
  }

  return {
    isValid:      true,
    healthStatus,
    grantedScopes,
    missingScopes,
    expiresAt,
  };
}
