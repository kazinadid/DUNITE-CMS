// ============================================================================
// DUNITE CMS — LinkedIn OAuth routes
// ============================================================================
// Handles LinkedIn OAuth initiation and callback.
// Mirrors the Facebook OAuth flow exactly.
// ============================================================================

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  generateOAuthState,
  persistStateMetadata,
  validateAndConsumeState,
} from './oauthAdapter';
import { getUserDefaultOrganization } from './socialAccountsRepository';
import { logOAuthActivity } from './integrationsActivityLogger';
import { buildLinkedInOAuthUrl, prepareOAuthSelectionMetadata } from './linkedin.service';

function integrationsUrl(req: NextRequest): URL {
  return new URL('/dashboard/integrations', req.url);
}

export function redirectWithIntegrationError(
  req: NextRequest,
  code: string,
  message: string,
) {
  const url = integrationsUrl(req);
  url.searchParams.set('error', code);
  url.searchParams.set('message', message);
  return NextResponse.redirect(url);
}

async function getAuthenticatedUserAndOrg(req: NextRequest) {
  let userId: string;
  try {
    const { user } = await createAuthenticatedSupabaseServerClient();
    userId = user.id;
  } catch {
    return {
      response: NextResponse.redirect(new URL('/login', req.url)),
      userId: null,
      orgInfo: null,
    };
  }

  const orgInfo = await getUserDefaultOrganization(userId);
  if (!orgInfo) {
    return {
      response: redirectWithIntegrationError(
        req,
        'no_organization',
        'Your account is not part of any organization.',
      ),
      userId: null,
      orgInfo: null,
    };
  }

  return { response: null, userId, orgInfo };
}

export async function startLinkedInOAuth(req: NextRequest): Promise<NextResponse> {
  const { response, userId, orgInfo } = await getAuthenticatedUserAndOrg(req);
  if (response || !userId || !orgInfo) return response!;

  if (orgInfo.role === 'viewer') {
    return redirectWithIntegrationError(
      req,
      'insufficient_permissions',
      'Viewers cannot connect LinkedIn organizations.',
    );
  }

  try {
    const { stateToken } = await generateOAuthState({
      organizationId: orgInfo.id,
      userId,
      platform: 'linkedin',
      ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    const oauthUrl = buildLinkedInOAuthUrl(stateToken);
    return NextResponse.redirect(oauthUrl);
  } catch (err) {
    console.error('[linkedin.routes] OAuth initiation failed:', err);
    return redirectWithIntegrationError(
      req,
      'linkedin_oauth_failed',
      'Could not initiate LinkedIn authorization. Please try again.',
    );
  }
}

export async function handleLinkedInOAuthCallback(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription =
    searchParams.get('error_description') ?? searchParams.get('error_reason');

  const { response, userId, orgInfo } = await getAuthenticatedUserAndOrg(req);
  if (response || !userId || !orgInfo) return response!;

  if (oauthError) {
    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'oauth_failed',
      message: oauthErrorDescription || 'LinkedIn OAuth was denied or failed.',
      metadata: {
        provider: 'linkedin',
        phase: 'callback',
        meta_error: oauthError,
      },
    });

    return redirectWithIntegrationError(
      req,
      'oauth_failure',
      oauthErrorDescription || 'LinkedIn authorization was cancelled.',
    );
  }

  if (!code || !state) {
    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'oauth_failed',
      message: 'LinkedIn callback missing code or state.',
      metadata: { provider: 'linkedin', phase: 'callback' },
    });
    return redirectWithIntegrationError(
      req,
      'invalid_callback',
      'LinkedIn callback was missing the authorization code or state.',
    );
  }

  let stateId: string;
  try {
    const { record } = await validateAndConsumeState(state, 'linkedin');
    stateId = record.id;

    if (record.initiated_by !== userId) {
      throw new Error('OAuth state belongs to another user.');
    }
    if (record.organization_id !== orgInfo.id) {
      throw new Error('OAuth state belongs to another organization.');
    }
  } catch (err) {
    console.error('[linkedin.routes] State validation failed:', err);
    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'oauth_failed',
      message: 'LinkedIn OAuth state validation failed.',
      metadata: {
        provider: 'linkedin',
        phase: 'state',
        detail: (err as Error).message,
      },
    });
    return redirectWithIntegrationError(
      req,
      'invalid_oauth_state',
      'LinkedIn security validation failed. Please reconnect.',
    );
  }

  try {
    const { metadata } = await prepareOAuthSelectionMetadata(code);
    await persistStateMetadata(stateId, metadata);

    const selectUrl = new URL('/dashboard/integrations/select-organizations', req.url);
    selectUrl.searchParams.set('state', stateId);
    return NextResponse.redirect(selectUrl);
  } catch (err) {
    console.error('[linkedin.routes] Callback failed:', err);

    const message = err instanceof Error ? err.message : 'Could not complete LinkedIn authorization. Please try again.';

    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'oauth_failed',
      message,
      metadata: {
        provider: 'linkedin',
        phase: 'token_or_organizations',
        error: 'linkedin_callback_failed',
      },
    });

    return redirectWithIntegrationError(req, 'linkedin_callback_failed', message);
  }
}
