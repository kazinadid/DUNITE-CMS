'use server';

// ============================================================================
// DUNITE CMS — Integrations server actions
// ============================================================================
// All mutations go through these actions. They enforce authentication,
// RBAC, and organization scoping. Tokens are NEVER returned to the client.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  listSocialAccountsByOrg,
  getSocialAccountById,
  savePageConnection,
  disconnectAccount,
  getUserDefaultOrganization,
} from './socialAccountsRepository';
import { loadStateForSelection, completeState } from './oauthAdapter';
import { logOAuthActivity } from './integrationsActivityLogger';
import { refreshFacebookToken } from '../lib/tokenManager';
import { updateEncryptedUserToken, fetchEncryptedTokens } from './socialAccountsRepository';
import { runFacebookDiagnostics } from './diagnosticsService';
import type {
  SocialAccount,
  SocialPlatform,
  ActionResult,
  PageSelectionResult,
  DiagnosticsResult,
} from '../types';

// ── Helper: require authenticated user + org ──────────────────────────────────

async function requireUserAndOrg() {
  const { user } = await createAuthenticatedSupabaseServerClient();
  const orgInfo = await getUserDefaultOrganization(user.id);
  if (!orgInfo) throw new Error('Your account is not part of any organization.');
  return { userId: user.id, orgInfo };
}

function canManageIntegrations(role: string): boolean {
  return role === 'admin' || role === 'editor';
}

// ── List social accounts ──────────────────────────────────────────────────────

export async function listSocialAccountsAction(
  platform?: SocialPlatform,
): Promise<ActionResult<SocialAccount[]>> {
  try {
    const { orgInfo } = await requireUserAndOrg();
    const accounts = await listSocialAccountsByOrg(orgInfo.id, platform);
    return { ok: true, data: accounts };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Page selection: save connected pages ─────────────────────────────────────

export async function selectFacebookPagesAction(
  stateId: string,
  selectedPageIds: string[],
): Promise<ActionResult<PageSelectionResult>> {
  if (!stateId || selectedPageIds.length === 0) {
    return { ok: false, error: 'No pages selected.' };
  }

  try {
    const { userId, orgInfo } = await requireUserAndOrg();

    if (!canManageIntegrations(orgInfo.role)) {
      return { ok: false, error: 'Insufficient permissions to connect social accounts.' };
    }

    // Load and validate the OAuth state
    const oauthState = await loadStateForSelection(stateId, userId);
    const meta = oauthState.metadata;

    if (!meta.pages || meta.pages.length === 0) {
      return { ok: false, error: 'No page data found in this session. Please reconnect.' };
    }
    if (!meta.encrypted_user_token) {
      return { ok: false, error: 'User token not found in session. Please reconnect.' };
    }

    const selectedPages = meta.pages.filter((p) => selectedPageIds.includes(p.id));
    if (selectedPages.length === 0) {
      return { ok: false, error: 'None of the selected pages were found in your authorized list.' };
    }

    const grantedScopes = Array.from(new Set(
      selectedPages.flatMap((p) => p.tasks ?? [])
    ));

    // Derive user token expiry info from metadata
    const userTokenExpiresIn = meta.token_expires_at
      ? Math.floor((new Date(meta.token_expires_at).getTime() - Date.now()) / 1000)
      : 0;

    const connected: SocialAccount[] = [];
    const skipped: string[] = [];

    for (const page of selectedPages) {
      try {
        const account = await savePageConnection({
          organizationId:     orgInfo.id,
          connectedBy:        userId,
          platform:           'facebook',
          page,
          encryptedUserToken: meta.encrypted_user_token,
          userTokenExpiresIn,
          grantedScopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
        });
        connected.push(account);

        await logOAuthActivity({
          userId,
          organizationId: orgInfo.id,
          actionType:     'social.page_connected',
          message:        `Facebook Page "${page.name}" connected.`,
          accountId:      account.id,
          metadata: {
            platform:  'facebook',
            page_id:   page.id,
            page_name: page.name,
          },
        });
      } catch (err) {
        console.error(`[selectPages] Failed to save page ${page.id}:`, err);
        skipped.push(page.id);
      }
    }

    // Mark OAuth state as completed
    await completeState(stateId);

    revalidatePath('/dashboard/integrations');
    return { ok: true, data: { connected, skipped } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectSocialAccountAction(
  accountId: string,
): Promise<ActionResult> {
  try {
    const { userId, orgInfo } = await requireUserAndOrg();

    if (!canManageIntegrations(orgInfo.role)) {
      return { ok: false, error: 'Insufficient permissions to disconnect accounts.' };
    }

    const account = await getSocialAccountById(accountId, orgInfo.id);
    if (!account) {
      return { ok: false, error: 'Account not found or you do not have access.' };
    }

    await disconnectAccount(accountId, orgInfo.id);

    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType:     'social.page_disconnected',
      message:        `${account.platform} Page "${account.external_name}" disconnected.`,
      accountId,
      metadata: {
        platform:  account.platform,
        page_id:   account.external_id,
        page_name: account.external_name,
      },
    });

    revalidatePath('/dashboard/integrations');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export async function refreshAccountTokenAction(
  accountId: string,
): Promise<ActionResult<{ expiresAt: string | null }>> {
  try {
    const { userId, orgInfo } = await requireUserAndOrg();

    if (!canManageIntegrations(orgInfo.role)) {
      return { ok: false, error: 'Insufficient permissions.' };
    }

    const account = await getSocialAccountById(accountId, orgInfo.id);
    if (!account) return { ok: false, error: 'Account not found.' };
    if (account.platform !== 'facebook') {
      return { ok: false, error: 'Token refresh is only supported for Facebook.' };
    }

    const tokens = await fetchEncryptedTokens(accountId);
    if (!tokens.encrypted_user_token) {
      return { ok: false, error: 'No user token available — reconnect required.' };
    }

    const refreshed = await refreshFacebookToken(tokens.encrypted_user_token);

    await updateEncryptedUserToken(
      accountId,
      refreshed.encryptedToken,
      refreshed.expiresAt,
      refreshed.issuedAt,
    );

    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType:     'social.token_refreshed',
      message:        `Token refreshed for "${account.external_name}".`,
      accountId,
      metadata: { platform: account.platform },
    });

    revalidatePath('/dashboard/integrations');
    return { ok: true, data: { expiresAt: refreshed.expiresAt?.toISOString() ?? null } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Run diagnostics ───────────────────────────────────────────────────────────

export async function runDiagnosticsAction(
  accountId: string,
): Promise<ActionResult<DiagnosticsResult>> {
  try {
    const { userId, orgInfo } = await requireUserAndOrg();

    const account = await getSocialAccountById(accountId, orgInfo.id);
    if (!account) return { ok: false, error: 'Account not found.' };

    if (account.platform !== 'facebook') {
      return { ok: false, error: 'Diagnostics only available for Facebook.' };
    }

    const result = await runFacebookDiagnostics(account, userId);
    revalidatePath('/dashboard/integrations');

    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Get page selection state ──────────────────────────────────────────────────

export async function getPageSelectionStateAction(stateId: string): Promise<
  ActionResult<{
    stateId: string;
    platform: string;
    pages: Array<{
      id: string;
      name: string;
      category: string;
      picture_url: string | null;
      fan_count: number | null;
    }>;
  }>
> {
  try {
    const { userId } = await requireUserAndOrg();
    const oauthState = await loadStateForSelection(stateId, userId);

    const pages = (oauthState.metadata.pages ?? []).map((p) => ({
      id:          p.id,
      name:        p.name,
      category:    p.category,
      picture_url: p.picture_url,
      fan_count:   p.fan_count,
    }));

    return {
      ok: true,
      data: { stateId, platform: oauthState.platform, pages },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
