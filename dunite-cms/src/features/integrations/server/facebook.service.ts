// ============================================================================
// DUNITE CMS — Facebook OAuth + Graph API service
// ============================================================================
// Server-only service. Owns Meta Graph API calls, retries, token exchange,
// Page fetching, secure token encryption, and OAuth selection payloads.
// ============================================================================

import type { OAuthStateMetadata, PendingFacebookPage } from '../types';
import { encryptToken } from '../lib/encryption';
import { computeExpiresAt, computeTokenType } from '../lib/tokenManager';
import {
  FACEBOOK_GRAPH_VERSION,
  FACEBOOK_OAUTH_SCOPES,
  type FacebookGraphErrorShape,
  type FacebookOAuthTokenResponse,
  type FacebookPage,
  type FacebookPagesResponse,
  type FacebookUserProfile,
} from './facebook.types';

function facebookRestBase(): string {
  const ver =
    process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || FACEBOOK_GRAPH_VERSION;
  return `https://graph.facebook.com/${ver}`;
}

const GRAPH_BASE_URL = facebookRestBase();
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

function graphTimeoutMs(): number {
  const raw = process.env.FACEBOOK_API_TIMEOUT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 120_000) : 25_000;
}

/**
 * POST application/x-www-form-urlencoded to the Graph API (feed, photos, …).
 * @server-only
 */
export async function facebookGraphPostForm<T extends Record<string, unknown>>(
  relativePath: string,
  formBody: URLSearchParams,
  label: string,
  attempt = 0,
): Promise<T> {
  const base = facebookRestBase();
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const url = `${base}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'DUNITE-CMS/1.0',
      },
      body: formBody.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(graphTimeoutMs()),
    });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return facebookGraphPostForm<T>(relativePath, formBody, label, attempt + 1);
    }
    throw new FacebookServiceError(
      'facebook_network_error',
      `Facebook ${label} POST network failure: ${(err as Error).message}`,
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
      await sleep(450 * (attempt + 1));
      return facebookGraphPostForm<T>(relativePath, formBody, label, attempt + 1);
    }

    throw new FacebookServiceError(
      retryable ? 'facebook_rate_limited' : 'facebook_graph_error',
      graphError?.message ?? `Facebook ${label} POST failed with HTTP ${response.status}.`,
      {
        graphCode,
        graphSubcode: graphError?.error_subcode,
        retryable,
      },
    );
  }

  return body as T;
}

/**
 * GET `{graph_version}{path}?access_token=…` — insights, object summary fields, paging.
 */
export async function facebookGraphGet<T>(
  relativePath: string,
  accessToken: string,
  label: string,
  attempt = 0,
): Promise<T> {
  const base = facebookRestBase();
  const rawPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const url = new URL(`${base}${rawPath}`);
  url.searchParams.set('access_token', accessToken);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'DUNITE-CMS/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(graphTimeoutMs()),
    });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return facebookGraphGet<T>(relativePath, accessToken, label, attempt + 1);
    }
    throw new FacebookServiceError(
      'facebook_network_error',
      `Facebook ${label} GET failure: ${(err as Error).message}`,
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
      await sleep(450 * (attempt + 1));
      return facebookGraphGet<T>(relativePath, accessToken, label, attempt + 1);
    }

    throw new FacebookServiceError(
      retryable ? 'facebook_rate_limited' : 'facebook_graph_error',
      graphError?.message ?? `Facebook ${label} GET failed with HTTP ${response.status}.`,
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

/**
 * Exchange short-lived user token for ~60-day long-lived user token.
 */
export async function exchangeShortLivedForLongLived(
  shortLivedToken: string,
): Promise<FacebookOAuthTokenResponse> {
  const { appId, appSecret } = getFacebookEnv();
  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedToken);

  return graphFetch<FacebookOAuthTokenResponse>(url.toString(), 'long_lived_exchange');
}

export async function getFacebookProfile(accessToken: string): Promise<FacebookUserProfile> {
  const url = new URL(`${GRAPH_BASE_URL}/me`);
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('access_token', accessToken);

  return graphFetch<FacebookUserProfile>(url.toString(), 'profile');
}

/** GET /me/accounts — Pages the user can manage with page access tokens */
export async function getFacebookPages(accessToken: string): Promise<FacebookPage[]> {
  const pages: FacebookPage[] = [];
  let nextUrl: string | null = `${GRAPH_BASE_URL}/me/accounts?${new URLSearchParams({
    access_token: accessToken,
    fields:
      'id,name,category,access_token,tasks,link,picture.type(large),followers_count,fan_count',
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

function facebookPagesToPending(pages: FacebookPage[]): PendingFacebookPage[] {
  return pages
    .filter((p) => Boolean(p.access_token))
    .map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category ?? '',
      encrypted_access_token: encryptToken(page.access_token),
      picture_url: page.picture?.data?.url ?? null,
      fan_count: page.fan_count ?? null,
      followers_count: page.followers_count ?? null,
      page_url: page.link ?? null,
      tasks: page.tasks ?? [],
    }));
}

/**
 * After OAuth callback: exchange code → long-lived user token, fetch `/me/accounts`,
 * encrypt tokens, return metadata stored on `oauth_states` until the user picks Pages.
 */
export async function prepareOAuthSelectionMetadata(code: string): Promise<{
  facebookUserId: string;
  metadata: OAuthStateMetadata;
}> {
  const short = await exchangeFacebookCode(code);
  const long = await exchangeShortLivedForLongLived(short.access_token);
  const profile = await getFacebookProfile(long.access_token);
  const pages = await getFacebookPages(long.access_token);

  if (pages.length === 0) {
    throw new FacebookServiceError(
      'facebook_no_pages_found',
      'No Facebook Pages were returned for this account. Grant Page permissions or ensure you manage at least one Page.',
    );
  }

  const pending = facebookPagesToPending(pages);
  if (pending.length === 0) {
    throw new FacebookServiceError(
      'facebook_no_pages_found',
      'Facebook returned Pages without usable access tokens.',
    );
  }

  const encryptedUserToken = encryptToken(long.access_token);
  const expiresAt = computeExpiresAt(long.expires_in ?? 0);
  const tokenType = computeTokenType(long.expires_in ?? 0);

  return {
    facebookUserId: profile.id,
    metadata: {
      encrypted_user_token: encryptedUserToken,
      token_expires_at: expiresAt?.toISOString() ?? null,
      token_type: tokenType,
      token_issued_at: new Date().toISOString(),
      facebook_user_id: profile.id,
      pages: pending,
    },
  };
}

/** Re-export scopes for diagnostics / grants consistency */
export { FACEBOOK_OAUTH_SCOPES };
