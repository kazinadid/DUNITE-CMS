// ============================================================================
// DUNITE CMS — Facebook Graph API client wrapper
// ============================================================================
// Server-side only. Never exposes App Secret or raw tokens to the client.
// All Graph API calls go through this module.
// ============================================================================

import type {
  FacebookPageResponse,
  FacebookPermissionsResponse,
  FacebookTokenDebugResponse,
  PendingFacebookPage,
} from '../types';
import { encryptToken, maskToken } from './encryption';

const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ── Environment helpers ───────────────────────────────────────────────────────

function requireFacebookEnv() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const callbackUrl = process.env.FACEBOOK_OAUTH_CALLBACK_URL;

  if (!appId || !appSecret || !callbackUrl) {
    throw new Error(
      '[facebook] Missing required environment variables: ' +
      'FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_OAUTH_CALLBACK_URL'
    );
  }

  return { appId, appSecret, callbackUrl };
}

export function getFacebookAppId(): string {
  const id = process.env.FACEBOOK_APP_ID;
  if (!id) throw new Error('[facebook] FACEBOOK_APP_ID is not set.');
  return id;
}

// ── OAuth URL builder ─────────────────────────────────────────────────────────

export interface BuildOAuthUrlOptions {
  state: string;
  scopes: string[];
  /** Extra params for future Instagram / additional Facebook features */
  extras?: Record<string, string>;
}

export function buildFacebookOAuthUrl(opts: BuildOAuthUrlOptions): string {
  const { appId, callbackUrl } = requireFacebookEnv();

  const params = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  callbackUrl,
    state:         opts.state,
    scope:         opts.scopes.join(','),
    response_type: 'code',
    ...opts.extras,
  });

  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params}`;
}

// ── Graph API error type ──────────────────────────────────────────────────────

export class GraphApiError extends Error {
  code: number;
  subcode?: number;
  fbtraceId?: string;

  constructor(message: string, code: number, subcode?: number, fbtraceId?: string) {
    super(message);
    this.name = 'GraphApiError';
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
  }
}

async function graphFetch<T>(url: string, label: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'DUNITE-CMS/1.0' },
      cache: 'no-store',
    }) as Response;
  } catch (netErr) {
    throw new Error(`[facebook:${label}] Network error: ${(netErr as Error).message}`);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.error) {
    const err = body.error ?? {};
    throw new GraphApiError(
      err.message ?? `HTTP ${res.status}`,
      err.code    ?? res.status,
      err.error_subcode,
      err.fbtrace_id,
    );
  }

  return body as T;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface ShortLivedTokenResult {
  access_token: string;
  token_type: string;
}

/**
 * Exchange an authorization code for a short-lived user access token.
 * Called immediately after the OAuth callback.
 */
export async function exchangeCodeForToken(code: string): Promise<ShortLivedTokenResult> {
  const { appId, appSecret, callbackUrl } = requireFacebookEnv();

  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('client_id',    appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri',  callbackUrl);
  url.searchParams.set('code',          code);

  const result = await graphFetch<ShortLivedTokenResult>(url.toString(), 'exchangeCode');
  console.info('[facebook] Code exchanged for short-lived token (masked):', maskToken(result.access_token));
  return result;
}

export interface LongLivedTokenResult {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}

/**
 * Exchange a short-lived token for a long-lived user access token (~60 days).
 * This MUST be done server-side.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<LongLivedTokenResult> {
  const { appId, appSecret } = requireFacebookEnv();

  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type',       'fb_exchange_token');
  url.searchParams.set('client_id',        appId);
  url.searchParams.set('client_secret',    appSecret);
  url.searchParams.set('fb_exchange_token', shortLivedToken);

  const result = await graphFetch<LongLivedTokenResult>(url.toString(), 'longLivedToken');
  console.info('[facebook] Exchanged for long-lived token, expires_in:', result.expires_in, 'seconds');
  return result;
}

// ── Fetch Pages ───────────────────────────────────────────────────────────────

interface AccountsResponse {
  data: FacebookPageResponse[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

/**
 * Fetch all authorized Pages for the given user access token.
 * Handles simple pagination (up to 200 pages).
 */
export async function fetchAuthorizedPages(
  userAccessToken: string,
): Promise<FacebookPageResponse[]> {
  const pages: FacebookPageResponse[] = [];
  let url: string | null =
    `${GRAPH_BASE}/me/accounts?` +
    new URLSearchParams({
      access_token: userAccessToken,
      fields: 'id,name,category,access_token,tasks,picture.type(large),fan_count,followers_count,link',
      limit: '100',
    });

  let safetyLimit = 0;
  while (url && safetyLimit < 3) {
    const currentUrl = url;
    const pageResult: AccountsResponse = await graphFetch<AccountsResponse>(currentUrl, 'fetchPages');
    pages.push(...(pageResult.data ?? []));
    url = pageResult.paging?.next ?? null;
    safetyLimit++;
  }

  console.info(`[facebook] Fetched ${pages.length} authorized pages`);
  return pages;
}

/**
 * Normalize raw Page responses into PendingFacebookPage objects.
 * Encrypts each page access token immediately — raw tokens are discarded.
 */
export function normalizePendingPages(
  rawPages: FacebookPageResponse[],
): PendingFacebookPage[] {
  return rawPages.map((p) => ({
    id:                      p.id,
    name:                    p.name,
    category:                p.category,
    encrypted_access_token:  encryptToken(p.access_token),
    picture_url:             p.picture?.data?.url ?? null,
    fan_count:               p.fan_count ?? null,
    followers_count:         p.followers_count ?? null,
    page_url:                p.link ?? null,
    tasks:                   p.tasks ?? [],
  }));
}

// ── Token debug / validation ──────────────────────────────────────────────────

/**
 * Calls /debug_token with App ID|App Secret as the app-level token.
 * Never passes raw user/page tokens outside server code.
 */
export async function debugToken(
  tokenToInspect: string,
): Promise<FacebookTokenDebugResponse['data']> {
  const { appId, appSecret } = requireFacebookEnv();
  const appToken = `${appId}|${appSecret}`;

  const url = new URL(`${GRAPH_BASE}/debug_token`);
  url.searchParams.set('input_token', tokenToInspect);
  url.searchParams.set('access_token', appToken);

  const result = await graphFetch<FacebookTokenDebugResponse>(url.toString(), 'debugToken');
  return result.data;
}

// ── Permissions ───────────────────────────────────────────────────────────────

/**
 * Returns the list of granted permissions for the given token.
 */
export async function fetchTokenPermissions(
  accessToken: string,
): Promise<FacebookPermissionsResponse['data']> {
  const url = `${GRAPH_BASE}/me/permissions?access_token=${encodeURIComponent(accessToken)}`;
  const result = await graphFetch<FacebookPermissionsResponse>(url, 'permissions');
  return result.data ?? [];
}

// ── Validate page token ────────────────────────────────────────────────────────

/**
 * Light validation: confirm a page token is still usable by hitting /me with it.
 * Returns the page ID if valid, throws GraphApiError otherwise.
 */
export async function validatePageToken(pageAccessToken: string): Promise<string> {
  const url = `${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(pageAccessToken)}`;
  const res = await graphFetch<{ id: string }>(url, 'validatePageToken');
  return res.id;
}
