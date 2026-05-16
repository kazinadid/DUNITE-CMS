// ============================================================================
// DUNITE CMS — Diagnostics service
// ============================================================================
// Validates account health via Graph API. Used by background jobs and
// the on-demand "Check health" action in the dashboard.
// Server-side only — decrypts tokens internally, never exposes them.
// ============================================================================

import type {
  SocialAccount,
  DiagnosticsResult,
  DiagnosticsIssue,
  AccountHealthStatus,
  SocialAccountStatus,
} from '../types';
import { FACEBOOK_REQUIRED_SCOPES } from '../types';
import { decryptToken } from '../lib/encryption';
import {
  validatePageToken,
  GraphApiError,
} from '../lib/facebookClient';
import { resolveTokenHealthViaApi } from '../lib/tokenManager';
import {
  updateAccountHealth,
  fetchEncryptedTokens,
} from './socialAccountsRepository';
import { logOAuthActivity } from './integrationsActivityLogger';

// ── Validation intervals ──────────────────────────────────────────────────────

const HEALTHY_RECHECK_HOURS  = 24;   // Check every 24h when healthy
const WARNING_RECHECK_HOURS  = 6;    // Check every 6h when expiring soon
const ERROR_RECHECK_HOURS    = 1;    // Check every hour on error states

// ── Diagnostics runner ────────────────────────────────────────────────────────

/**
 * Runs a full diagnostics check for a Facebook account.
 * Decrypts page token, calls Graph API, updates health in DB.
 */
export async function runFacebookDiagnostics(
  account: SocialAccount,
  userId?: string,
): Promise<DiagnosticsResult> {
  const checkedAt = new Date();
  const issues: DiagnosticsIssue[] = [];

  // ── Fetch encrypted tokens ────────────────────────────────────────────────
  let pageToken: string | null = null;
  let userToken: string | null = null;

  try {
    const tokens = await fetchEncryptedTokens(account.id);

    if (tokens.encrypted_page_token) {
      pageToken = decryptToken(tokens.encrypted_page_token);
    }
    if (tokens.encrypted_user_token) {
      userToken = decryptToken(tokens.encrypted_user_token);
    }
  } catch (err) {
    issues.push({
      kind:        'invalid_token',
      message:     'Stored token could not be decrypted.',
      detail:      (err as Error).message,
      recoverable: false,
    });

    return buildResult(account, checkedAt, false, 'reconnect_required', issues, [], []);
  }

  if (!pageToken) {
    issues.push({
      kind:        'invalid_token',
      message:     'No page access token stored. Reconnect required.',
      recoverable: false,
    });
    return buildResult(account, checkedAt, false, 'reconnect_required', issues, [], []);
  }

  // ── Validate page token ───────────────────────────────────────────────────
  try {
    await validatePageToken(pageToken);
  } catch (err) {
    const graphErr = err as GraphApiError;
    const isRevoked = graphErr.code === 190 || graphErr.code === 102;

    issues.push({
      kind:        isRevoked ? 'token_expired' : 'graph_api_error',
      message:     isRevoked
        ? 'Page token has been revoked or expired.'
        : `Graph API error: ${graphErr.message}`,
      detail:      `code=${graphErr.code}, subcode=${graphErr.subcode}`,
      recoverable: false,
    });

    const healthStatus: AccountHealthStatus = isRevoked ? 'expired' : 'disconnected';
    await persistDiagnosticsResult(account, healthStatus, 'reconnect_required', issues, userId);
    return buildResult(account, checkedAt, false, healthStatus, issues, [], []);
  }

  // ── Check permissions ─────────────────────────────────────────────────────
  let grantedScopes: string[] = account.granted_scopes ?? [];
  let missingScopes: string[] = [];

  try {
    const tokenToCheck = userToken ?? pageToken;
    const tokenHealth  = await resolveTokenHealthViaApi(
      tokenToCheck,
      [...FACEBOOK_REQUIRED_SCOPES],
    );

    grantedScopes = tokenHealth.grantedScopes;
    missingScopes = tokenHealth.missingScopes;

    if (missingScopes.length > 0) {
      issues.push({
        kind:        'scope_missing',
        message:     `Missing required permissions: ${missingScopes.join(', ')}`,
        recoverable: true,
      });
    }

    if (!tokenHealth.isValid) {
      issues.push({
        kind:        'invalid_token',
        message:     'User token is no longer valid.',
        recoverable: false,
      });
    }
  } catch (err) {
    // Permission check failure is non-fatal — page token validated already.
    issues.push({
      kind:        'graph_api_error',
      message:     `Could not verify permissions: ${(err as Error).message}`,
      recoverable: true,
    });
  }

  // ── Derive final health status ────────────────────────────────────────────
  let healthStatus: AccountHealthStatus = 'healthy';
  let accountStatus: SocialAccountStatus = 'active';

  if (issues.some((i) => i.kind === 'scope_missing')) {
    healthStatus  = 'permission_error';
    accountStatus = 'reconnect_required';
  } else if (issues.length > 0) {
    healthStatus  = 'warning';
  }

  await persistDiagnosticsResult(account, healthStatus, accountStatus, issues, userId);

  return buildResult(account, checkedAt, issues.length === 0, healthStatus, issues, grantedScopes, missingScopes);
}

// ── Persist result ────────────────────────────────────────────────────────────

async function persistDiagnosticsResult(
  account: SocialAccount,
  healthStatus: AccountHealthStatus,
  status: SocialAccountStatus,
  issues: DiagnosticsIssue[],
  userId?: string,
): Promise<void> {
  const recheckHours =
    healthStatus === 'healthy'        ? HEALTHY_RECHECK_HOURS
    : healthStatus === 'warning'      ? WARNING_RECHECK_HOURS
    : ERROR_RECHECK_HOURS;

  const nextValidation = new Date(Date.now() + recheckHours * 60 * 60 * 1000);
  const errorSummary   = issues.map((i) => i.message).join('; ') || null;

  await updateAccountHealth({
    accountId:       account.id,
    healthStatus,
    status,
    validationError: errorSummary,
    nextValidationAt: nextValidation,
  });

  if (userId) {
    const changed = healthStatus !== account.health_status;
    if (changed || issues.length > 0) {
      await logOAuthActivity({
        userId,
        organizationId: account.organization_id,
        actionType:     issues.length === 0 ? 'social.validation_passed' : 'social.validation_failed',
        message:        issues.length === 0
          ? `Health check passed for "${account.external_name}".`
          : `Health check found issues for "${account.external_name}": ${issues.length} issue(s).`,
        accountId: account.id,
        metadata: {
          platform:     account.platform,
          health_status: healthStatus,
          issue_count:   issues.length,
        },
      });
    }
  }
}

// ── Build result ──────────────────────────────────────────────────────────────

function buildResult(
  account: SocialAccount,
  checkedAt: Date,
  isValid: boolean,
  healthStatus: AccountHealthStatus,
  issues: DiagnosticsIssue[],
  grantedScopes: string[],
  missingScopes: string[],
): DiagnosticsResult {
  const tokenExpiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;
  const tokenDaysRemaining = tokenExpiresAt
    ? Math.max(0, Math.floor((tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    accountId:          account.id,
    platform:           account.platform,
    externalId:         account.external_id,
    checkedAt,
    isValid,
    healthStatus,
    issues,
    grantedScopes,
    missingScopes,
    tokenExpiresAt,
    tokenDaysRemaining,
  };
}

