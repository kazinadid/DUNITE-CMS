// ============================================================================
// DUNITE CMS — Facebook OAuth + Graph API service
// ============================================================================
// Server-only service. Owns Meta Graph API calls, retries, token exchange,
// Page fetching, secure token encryption, and persistence.
// ============================================================================

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import { encryptToken } from '../lib/encryption';
import { computeExpiresAt, computeTokenType } from '../lib/tokenManager';
import { logOAuthActivity } from './integrationsActivityLogger';
import {
  FACEBOOK_GRAPH_VERSION,
  FACEBOOK_OAUTH_SCOPES,
  type ConnectedFacebookPageResult,
  type FacebookGraphErrorShape,
  type FacebookOAuthTokenResponse,
  type FacebookPage,
  type FacebookPagesResponse,
  type FacebookUserProfile,
} from './facebook.types';

const GRAPH_BASE_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}`;
const MAX_RETRIES = 2;

export class FacebookServiceError extends Error {
  code: string;
  graphCode?: number;
  graphSubcode?: number;
  retryable: boolean;

  constructor(
    code: string,
    message: string,
    opts?: { graphCode?: number; graphSubcode?: number; retryable?: boolean },
  ) {
    super(message);
    this.name = 'FacebookServiceError';
    this.code = code;
    this.graphCode = opts?.graphCode;
    this.graphSubcode = opts?.graphSubcode;
    this.retryable = opts?.retryable ?? false;
  }
}

export function getFacebookRedirectUri(): string {
  return (
    process.env.FACEBOOK_OAUTH_CALLBACK_URL ||
    'http://localhost:3000/api/integrations/facebook/callback'
  );
}

function getFacebookEnv() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new FacebookServiceError(
      'facebook_config_missing',
      'Facebook App ID or App Secret is missing.',
    );
  }

  return { appId, appSecret, redirectUri: getFacebookRedirectUri() };
}

export function buildFacebookOAuthUrl(state: string): string {
  const { appId, redirectUri } = getFacebookEnv();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: FACEBOOK_OAUTH_SCOPES.join(','),
  });

  return `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphFetch<T>(
  url: string,
  label: string,
  attempt = 0,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'DUNITE-CMS/1.0' },
      cache: 'no-store',
    });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(250 * (attempt + 1));
      return graphFetch<T>(url, label, attempt + 1);
    }
    throw new FacebookServiceError(
      'facebook_network_error',
      `Facebook ${label} network failure: ${(err as Error).message}`,
      { retryable: true },
    );
  }

  const body = (await response.json().catch(() => ({}))) as FacebookGraphErrorShape & T;
  const graphError = (body as FacebookGraphErrorShape).error;
  if (!response.ok || graphError) {
    const graphCode = graphError?.code ?? response.status;
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      graphCode === 4 ||
      graphCode === 17 ||
      graphCode === 613;

    if (retryable && attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return graphFetch<T>(url, label, attempt + 1);
    }

    throw new FacebookServiceError(
      retryable ? 'facebook_rate_limited' : 'facebook_graph_error',
      graphError?.message ?? `Facebook ${label} failed with HTTP ${response.status}.`,
      {
        graphCode,
        graphSubcode: graphError?.error_subcode,
        retryable,
      },
    );
  }

  return body as T;
}

export async function exchangeFacebookCode(code: string): Promise<FacebookOAuthTokenResponse> {
  const { appId, appSecret, redirectUri } = getFacebookEnv();
  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  return graphFetch<FacebookOAuthTokenResponse>(url.toString(), 'code_exchange');
}

export async function getFacebookProfile(accessToken: string): Promise<FacebookUserProfile> {
  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('access_token', accessToken);

  return graphFetch<FacebookUserProfile>(url.toString(), 'profile');
}

export async function getFacebookPages(accessToken: string): Promise<FacebookPage[]> {
  const pages: FacebookPage[] = [];
  let nextUrl: string | null = `${GRAPH_BASE_URL}/me/accounts?${new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,category,access_token,tasks,link,picture.type(large),followers_count,fan_count',
    limit: '100',
  })}`;

  let pageCount = 0;
  while (nextUrl && pageCount < 5) {
    const response: FacebookPagesResponse = await graphFetch<FacebookPagesResponse>(
      nextUrl,
      'pages',
    );
    pages.push(...(response.data ?? []));
    nextUrl = response.paging?.next ?? null;
    pageCount++;
  }

  return pages;
}

function getMissingScopesFromPages(pages: FacebookPage[]): string[] {
  if (pages.length > 0) return [];
  return ['pages_show_list'];
}

export async function connectFacebookPage(input: {
  organizationId: string;
  connectedBy: string;
  facebookUserId: string;
  userAccessToken: string;
  userTokenExpiresIn?: number;
  page: FacebookPage;
}): Promise<ConnectedFacebookPageResult> {
  const supabase = createSupabaseServiceRoleClient();
  const encryptedPageToken = encryptToken(input.page.access_token);
  const encryptedUserToken = encryptToken(input.userAccessToken);
  const tokenExpiresAt = computeExpiresAt(input.userTokenExpiresIn ?? 0);
  const tokenType = computeTokenType(input.userTokenExpiresIn ?? 0);
  const nowIso = new Date().toISOString();

  const metadata = {
    category: input.page.category ?? null,
    page_url: input.page.link ?? null,
    picture_url: input.page.picture?.data?.url ?? null,
    followers_count: input.page.followers_count ?? null,
    fan_count: input.page.fan_count ?? null,
    tasks: input.page.tasks ?? [],
    facebook_user_id: input.facebookUserId,
    encrypted_user_token: encryptedUserToken,
  };

  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(
      {
        organization_id: input.organizationId,
        connected_by: input.connectedBy,

        // Compatibility schema requested for this phase.
        provider: 'facebook',
        page_id: input.page.id,
        page_name: input.page.name,
        access_token: encryptedPageToken,
        refresh_token: null,
        facebook_user_id: input.facebookUserId,
        metadata,

        // Existing richer schema.
        platform: 'facebook',
        account_type: 'page',
        external_id: input.page.id,
        external_name: input.page.name,
        external_category: input.page.category ?? null,
        page_url: input.page.link ?? null,
        profile_image_url: input.page.picture?.data?.url ?? null,
        status: 'active',
        health_status: 'healthy',
        encrypted_page_token: encryptedPageToken,
        encrypted_user_token: encryptedUserToken,
        token_expires_at: tokenExpiresAt?.toISOString() ?? null,
        token_type: tokenType,
        token_issued_at: nowIso,
        granted_scopes: [...FACEBOOK_OAUTH_SCOPES],
        permissions_metadata: { requested_scopes: FACEBOOK_OAUTH_SCOPES },
        page_metadata: metadata,
        last_validated_at: nowIso,
        last_validation_error: null,
        last_synced_at: nowIso,
        next_validation_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        disconnected_at: null,
      },
      {
        onConflict: 'organization_id,platform,external_id',
        ignoreDuplicates: false,
      },
    )
    .select('id, page_id, page_name, external_id, external_name')
    .single();

  if (error || !data) {
    throw new FacebookServiceError(
      'facebook_page_save_failed',
      `Could not save Facebook Page: ${error?.message ?? 'unknown error'}`,
    );
  }

  return {
    id: data.id as string,
    pageId: (data.page_id ?? data.external_id) as string,
    pageName: (data.page_name ?? data.external_name) as string,
  };
}

export async function disconnectFacebookPage(input: {
  accountId: string;
  organizationId: string;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('social_accounts')
    .update({
      status: 'disconnected',
      health_status: 'disconnected',
      access_token: null,
      encrypted_page_token: null,
      encrypted_user_token: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.accountId)
    .eq('organization_id', input.organizationId);

  if (error) {
    throw new FacebookServiceError(
      'facebook_disconnect_failed',
      `Could not disconnect Facebook Page: ${error.message}`,
    );
  }
}

export async function refreshFacebookToken(): Promise<never> {
  throw new FacebookServiceError(
    'facebook_reconnect_required',
    'Meta does not provide a standard refresh token for Facebook Page access. Reconnect the Page to rotate credentials.',
  );
}

export async function connectAllAuthorizedFacebookPages(input: {
  organizationId: string;
  connectedBy: string;
  code: string;
}): Promise<ConnectedFacebookPageResult[]> {
  const token = await exchangeFacebookCode(input.code);
  const profile = await getFacebookProfile(token.access_token);
  const pages = await getFacebookPages(token.access_token);

  const missingScopes = getMissingScopesFromPages(pages);
  if (missingScopes.length > 0) {
    throw new FacebookServiceError(
      'facebook_missing_permissions',
      `Facebook did not return any Pages. Missing/declined permission: ${missingScopes.join(', ')}.`,
    );
  }

  const connected: ConnectedFacebookPageResult[] = [];
  for (const page of pages) {
    if (!page.access_token) {
      console.warn('[facebook] Skipping page without access token:', page.id);
      continue;
    }

    connected.push(
      await connectFacebookPage({
        organizationId: input.organizationId,
        connectedBy: input.connectedBy,
        facebookUserId: profile.id,
        userAccessToken: token.access_token,
        userTokenExpiresIn: token.expires_in,
        page,
      }),
    );
  }

  if (connected.length === 0) {
    throw new FacebookServiceError(
      'facebook_no_pages_found',
      'No Facebook Pages with access tokens were returned for this account.',
    );
  }

  await logOAuthActivity({
    userId: input.connectedBy,
    organizationId: input.organizationId,
    actionType: 'social.facebook.connected',
    message: `Connected ${connected.length} Facebook Page(s).`,
    metadata: {
      provider: 'facebook',
      facebook_user_id: profile.id,
      page_count: connected.length,
    },
  });

  return connected;
}
