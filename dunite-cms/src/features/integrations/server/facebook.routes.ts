// ============================================================================
// DUNITE CMS — Facebook route helpers
// ============================================================================
// Keeps Next route handlers thin and consistent.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  completeState,
  generateOAuthState,
  validateAndConsumeState,
} from './oauthAdapter';
import { getUserDefaultOrganization } from './socialAccountsRepository';
import { logOAuthActivity } from './integrationsActivityLogger';
import {
  buildFacebookOAuthUrl,
  connectAllAuthorizedFacebookPages,
  FacebookServiceError,
} from './facebook.service';

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

function redirectWithSuccess(req: NextRequest, pageCount: number) {
  const url = integrationsUrl(req);
  url.searchParams.set('connected', `${pageCount} Facebook Page${pageCount === 1 ? '' : 's'}`);
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

export async function startFacebookOAuth(req: NextRequest): Promise<NextResponse> {
  const { response, userId, orgInfo } = await getAuthenticatedUserAndOrg(req);
  if (response || !userId || !orgInfo) return response!;

  if (orgInfo.role === 'viewer') {
    return redirectWithIntegrationError(
      req,
      'insufficient_permissions',
      'Viewers cannot connect Facebook Pages.',
    );
  }

  try {
    const { stateToken } = await generateOAuthState({
      organizationId: orgInfo.id,
      userId,
      platform: 'facebook',
      ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'social.facebook.oauth_started',
      message: 'Facebook OAuth started.',
      metadata: { provider: 'facebook' },
    });

    return NextResponse.redirect(buildFacebookOAuthUrl(stateToken));
  } catch (err) {
    console.error('[facebook.routes] OAuth start failed:', err);
    return redirectWithIntegrationError(
      req,
      err instanceof FacebookServiceError ? err.code : 'facebook_oauth_start_failed',
      'Could not start Facebook OAuth. Check integration configuration.',
    );
  }
}

export async function handleFacebookOAuthCallback(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description') ?? searchParams.get('error_reason');

  const { response, userId, orgInfo } = await getAuthenticatedUserAndOrg(req);
  if (response || !userId || !orgInfo) return response!;

  if (oauthError) {
    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'social.facebook.oauth_denied',
      message: 'Facebook OAuth was denied or failed at Meta.',
      metadata: { provider: 'facebook', error: oauthError, error_description: oauthErrorDescription },
    });

    return redirectWithIntegrationError(
      req,
      'oauth_failure',
      oauthErrorDescription || 'Facebook authorization was cancelled.',
    );
  }

  if (!code || !state) {
    return redirectWithIntegrationError(
      req,
      'invalid_callback',
      'Facebook callback was missing the authorization code or state.',
    );
  }

  let stateId: string;
  try {
    const { record } = await validateAndConsumeState(state, 'facebook');
    stateId = record.id;

    if (record.initiated_by !== userId) {
      throw new Error('OAuth state belongs to another user.');
    }
    if (record.organization_id !== orgInfo.id) {
      throw new Error('OAuth state belongs to another organization.');
    }
  } catch (err) {
    console.error('[facebook.routes] State validation failed:', err);
    return redirectWithIntegrationError(
      req,
      'invalid_oauth_state',
      'Facebook security validation failed. Please reconnect.',
    );
  }

  try {
    const connected = await connectAllAuthorizedFacebookPages({
      organizationId: orgInfo.id,
      connectedBy: userId,
      code,
    });

    await completeState(stateId);
    return redirectWithSuccess(req, connected.length);
  } catch (err) {
    console.error('[facebook.routes] Callback failed:', err);

    const code =
      err instanceof FacebookServiceError ? err.code : 'facebook_callback_failed';
    const message =
      err instanceof FacebookServiceError
        ? err.message
        : 'Could not connect Facebook Pages. Please try again.';

    await logOAuthActivity({
      userId,
      organizationId: orgInfo.id,
      actionType: 'social.facebook.oauth_failed',
      message,
      metadata: { provider: 'facebook', error: code },
    });

    return redirectWithIntegrationError(req, code, message);
  }
}
