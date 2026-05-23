import 'server-only';

import type { OAuthStateMetadata, PendingLinkedInOrganization } from '@/features/integrations/types';
import { encryptToken } from '@/features/integrations/lib/encryption';
import { computeExpiresAt, computeTokenType } from '@/features/integrations/lib/tokenManager';
import {
  LinkedInPermanentError,
  LinkedInTokenError,
  LinkedInTransientError,
} from './errors';

const LINKEDIN_OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const MAX_RETRIES = 2;

function getLinkedInScopes(): string[] {
  const raw = process.env.LINKEDIN_SCOPES;
  if (!raw) {
    return ['openid', 'profile', 'email', 'w_member_social'];
  }
  return raw.split(' ').filter(Boolean);
}

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
    throw new LinkedInPermanentError(
      'linkedin_config_missing',
      'LinkedIn Client ID or Client Secret is missing.',
    );
  }

  return { clientId, clientSecret, redirectUri: getLinkedInRedirectUri() };
}

export function buildLinkedInOAuthUrl(state: string): string {
  const { clientId, redirectUri } = getLinkedInEnv();
  const scopes = getLinkedInScopes();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(' '),
  });

  return `${LINKEDIN_OAUTH_BASE}/authorization?${params}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function linkedInFetch<T>(
  url: string,
  options: RequestInit,
  label: string,
  attempt = 0,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      cache: 'no-store',
    });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(250 * (attempt + 1));
      return linkedInFetch<T>(url, options, label, attempt + 1);
    }
    throw new LinkedInTransientError(
      'linkedin_network_error',
      `LinkedIn ${label} network failure: ${(err as Error).message}`,
    );
  }

  const body = await response.json().catch(() => ({})) as T;

  if (!response.ok) {
    const retryable =
      response.status === 429 ||
      response.status >= 500;

    if (retryable && attempt < MAX_RETRIES) {
      await sleep(400 * (attempt + 1));
      return linkedInFetch<T>(url, options, label, attempt + 1);
    }

    const errorData = body as Record<string, unknown>;
    const message = (errorData.message as string) ||
      (errorData.error_description as string) ||
      `LinkedIn ${label} failed with HTTP ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      throw new LinkedInTokenError('linkedin_auth_error', message);
    }

    if (response.status === 429) {
      throw new LinkedInTransientError('linkedin_rate_limited', message);
    }

    throw new LinkedInPermanentError('linkedin_api_error', message);
  }

  return body;
}

export interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type: string;
}

export async function exchangeLinkedInCode(code: string): Promise<LinkedInTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getLinkedInEnv();

  const url = `${LINKEDIN_OAUTH_BASE}/accessToken`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  return linkedInFetch<LinkedInTokenResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  }, 'code_exchange');
}

export interface LinkedInProfileResponse {
  sub: string;            // LinkedIn member ID
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: {
    country: string;
    language: string;
  };
  email: string;
  email_verified: boolean;
}

export async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfileResponse> {
  const url = `${LINKEDIN_API_BASE}/userinfo`;

  return linkedInFetch<LinkedInProfileResponse>(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  }, 'profile');
}

export interface LinkedInOrganizationAclResponse {
  paging: {
    count: number;
    start: number;
    links: Array<{ href?: string }>;
  };
  elements: Array<{
    role: string;
    state: string;
    organizationalTarget: string;  // urn:li:organization:xxxxx
  }>;
}

export interface LinkedInOrganizationDetailsResponse {
  id: number;
  name: string;
  localizedName: string;
  vanityName: string;
  logoV2?: {
    original?: {
      url: string;
    };
  };
}

export async function getLinkedInOrganizations(
  accessToken: string,
): Promise<Array<{ urn: string; role: string; name: string; logo_url: string | null }>> {
  const url = `${LINKEDIN_API_BASE}/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(role,state,organizationalTarget~(id,name,localizedName,vanityName,logoV2~(original~(url)))))`;

  const response = await linkedInFetch<LinkedInOrganizationAclResponse>(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  }, 'organizations');

  const organizations = [];

  for (const element of response.elements || []) {
    if (element.state !== 'ACTIVE') continue;

    const orgUrn = element.organizationalTarget;
    const orgDetails = (element as Record<string, unknown>)['organizationalTarget~'] as Record<string, unknown> | undefined;

    if (!orgDetails) continue;

    const logoV2 = orgDetails.logoV2 as Record<string, unknown> | undefined;
    const original = logoV2?.original as Record<string, unknown> | undefined;
    const logoUrl = (original?.url as string) || null;

    organizations.push({
      urn: orgUrn,
      role: element.role,
      name: (orgDetails.localizedName as string) || (orgDetails.name as string) || 'Unknown Organization',
      logo_url: logoUrl,
    });
  }

  return organizations;
}



function linkedinOrgsToPending(
  orgs: Array<{ urn: string; role: string; name: string; logo_url: string | null }>,
  accessToken: string,
): PendingLinkedInOrganization[] {
  const encryptedToken = encryptToken(accessToken);

  return orgs.map((org) => ({
    urn: org.urn,
    name: org.name,
    logo_url: org.logo_url,
    encrypted_access_token: encryptedToken,
    role: org.role,
  }));
}

export async function prepareOAuthSelectionMetadata(code: string): Promise<{
  linkedinMemberId: string;
  metadata: OAuthStateMetadata;
}> {
  const tokenResponse = await exchangeLinkedInCode(code);
  const profile = await getLinkedInProfile(tokenResponse.access_token);
  
  // Fetch organizations - optional for basic scopes (w_member_social only)
  // Will work with full scopes (r_organization_social) once app is approved
  let orgs: Array<{ urn: string; role: string; name: string; logo_url: string | null }> = [];
  try {
    orgs = await getLinkedInOrganizations(tokenResponse.access_token);
  } catch (err) {
    console.warn('[linkedin.oauth] Failed to fetch organizations (may be missing r_organization_social scope):', err);
  }

  const pending: PendingLinkedInOrganization[] = orgs.map((org) => ({
    urn: org.urn,
    name: org.name,
    logo_url: org.logo_url,
    encrypted_access_token: encryptToken(tokenResponse.access_token),
    role: org.role,
  }));

  const expiresAt = computeExpiresAt(tokenResponse.expires_in ?? 0);
  const tokenType = computeTokenType(tokenResponse.expires_in ?? 0);

  return {
    linkedinMemberId: profile.sub,
    metadata: {
      encrypted_user_token: encryptToken(tokenResponse.access_token),
      token_expires_at: expiresAt?.toISOString() ?? null,
      token_type: tokenType,
      token_issued_at: new Date().toISOString(),
      linkedin_member_id: profile.sub,
      organizations: pending,
    },
  };
}
