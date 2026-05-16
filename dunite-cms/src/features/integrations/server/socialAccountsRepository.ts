// ============================================================================
// DUNITE CMS — Social accounts repository
// ============================================================================
// All DB interactions for social_accounts, scoped to ensure no token leakage.
// Encrypted token columns are ONLY read when explicitly needed (validation/refresh).
// Server-side only.
// ============================================================================

import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type {
  SocialAccount,
  SocialPlatform,
  SocialAccountStatus,
  AccountHealthStatus,
  TokenType,
  PendingFacebookPage,
} from '../types';
import { encryptToken } from '../lib/encryption';
import { computeExpiresAt, computeTokenType } from '../lib/tokenManager';
import { FACEBOOK_REQUIRED_SCOPES } from '../types';

// ── Safe select (no token columns) ───────────────────────────────────────────

const SAFE_SELECT = [
  'id', 'organization_id', 'connected_by', 'platform', 'account_type',
  'provider', 'page_id', 'page_name', 'facebook_user_id',
  'external_id', 'external_name', 'external_category', 'page_url', 'profile_image_url',
  'status', 'health_status',
  'token_expires_at', 'token_type', 'token_issued_at',
  'granted_scopes', 'permissions_metadata', 'page_metadata',
  'last_validated_at', 'last_validation_error', 'next_validation_at', 'validation_attempt_count',
  'created_at', 'updated_at', 'disconnected_at',
].join(', ');

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function listSocialAccountsByOrg(
  organizationId: string,
  platform?: SocialPlatform,
): Promise<SocialAccount[]> {
  const supabase = createSupabaseServiceRoleClient();

  let q = supabase
    .from('social_accounts')
    .select(SAFE_SELECT)
    .eq('organization_id', organizationId)
    .neq('status', 'pending_selection')
    .order('created_at', { ascending: false });

  if (platform) q = q.eq('platform', platform);

  const { data, error } = await q;
  if (error) throw new Error(`[socialAccounts] listByOrg: ${error.message}`);
  return (data ?? []) as unknown as SocialAccount[];
}

export async function getSocialAccountById(
  accountId: string,
  organizationId: string,
): Promise<SocialAccount | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('social_accounts')
    .select(SAFE_SELECT)
    .eq('id', accountId)
    .eq('organization_id', organizationId)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw new Error(`[socialAccounts] getById: ${error.message}`);
  return data as unknown as SocialAccount;
}

// ── Create / upsert ───────────────────────────────────────────────────────────

export interface SavePageConnectionInput {
  organizationId: string;
  connectedBy: string;
  platform: SocialPlatform;
  page: PendingFacebookPage;
  encryptedUserToken: string;
  userTokenExpiresIn: number;
  grantedScopes: string[];
}

/**
 * Upsert a social account record from a PendingFacebookPage.
 * Resolves conflict on (organization_id, platform, external_id).
 */
export async function savePageConnection(
  input: SavePageConnectionInput,
): Promise<SocialAccount> {
  const supabase = createSupabaseServiceRoleClient();

  const expiresAt  = computeExpiresAt(input.userTokenExpiresIn);
  const tokenType  = computeTokenType(input.userTokenExpiresIn);

  const record = {
    organization_id:       input.organizationId,
    connected_by:          input.connectedBy,
    provider:              input.platform,
    page_id:               input.page.id,
    page_name:             input.page.name,
    access_token:          input.page.encrypted_access_token,
    refresh_token:         null,
    platform:              input.platform,
    account_type:          'page' as const,
    external_id:           input.page.id,
    external_name:         input.page.name,
    external_category:     input.page.category ?? null,
    page_url:              input.page.page_url ?? null,
    profile_image_url:     input.page.picture_url ?? null,
    status:                'active' as SocialAccountStatus,
    health_status:         'healthy' as AccountHealthStatus,
    encrypted_page_token:  input.page.encrypted_access_token,
    encrypted_user_token:  input.encryptedUserToken,
    token_expires_at:      expiresAt?.toISOString() ?? null,
    token_type:            tokenType as TokenType,
    token_issued_at:       new Date().toISOString(),
    granted_scopes:        input.grantedScopes,
    permissions_metadata:  {},
    page_metadata: {
      fan_count:       input.page.fan_count,
      followers_count: input.page.followers_count,
      tasks:           input.page.tasks,
    },
    metadata: {
      page_url:          input.page.page_url,
      profile_image_url: input.page.picture_url,
      category:          input.page.category,
      tasks:             input.page.tasks,
    },
    last_synced_at:        new Date().toISOString(),
    next_validation_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    disconnected_at:       null,
  };

  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(record, {
      onConflict: 'organization_id,platform,external_id',
      ignoreDuplicates: false,
    })
    .select(SAFE_SELECT)
    .single();

  if (error) throw new Error(`[socialAccounts] savePageConnection: ${error.message}`);
  return data as unknown as SocialAccount;
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectAccount(
  accountId: string,
  organizationId: string,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase
    .from('social_accounts')
    .update({
      status:            'disconnected',
      health_status:     'disconnected',
      disconnected_at:   new Date().toISOString(),
      access_token: null,
      encrypted_page_token: null,
      encrypted_user_token: null,
    })
    .eq('id', accountId)
    .eq('organization_id', organizationId);

  if (error) throw new Error(`[socialAccounts] disconnect: ${error.message}`);
}

// ── Health update ─────────────────────────────────────────────────────────────

export interface HealthUpdateInput {
  accountId: string;
  healthStatus: AccountHealthStatus;
  status: SocialAccountStatus;
  grantedScopes?: string[];
  validationError?: string | null;
  nextValidationAt?: Date;
  tokenExpiresAt?: Date | null;
}

export async function updateAccountHealth(input: HealthUpdateInput): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const patch: Record<string, unknown> = {
    health_status:             input.healthStatus,
    status:                    input.status,
    last_validated_at:         new Date().toISOString(),
    last_validation_error:     input.validationError ?? null,
    next_validation_at:        input.nextValidationAt?.toISOString() ?? null,
  };

  if (input.grantedScopes !== undefined) {
    patch.granted_scopes = input.grantedScopes;
  }

  if (input.tokenExpiresAt !== undefined) {
    patch.token_expires_at = input.tokenExpiresAt?.toISOString() ?? null;
  }

  await supabase
    .from('social_accounts')
    .update(patch)
    .eq('id', input.accountId);
}

// ── Fetch encrypted tokens (restricted internal use only) ─────────────────────

/**
 * Returns raw encrypted tokens for a given account.
 * Used ONLY by the validation/refresh background jobs.
 * NEVER expose these values to client-facing APIs.
 */
export async function fetchEncryptedTokens(accountId: string): Promise<{
  encrypted_page_token: string | null;
  encrypted_user_token: string | null;
}> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('social_accounts')
    .select('encrypted_page_token, encrypted_user_token, access_token')
    .eq('id', accountId)
    .single();

  if (error) throw new Error(`[socialAccounts] fetchEncryptedTokens: ${error.message}`);
  return {
    encrypted_page_token: data?.encrypted_page_token ?? data?.access_token ?? null,
    encrypted_user_token: data?.encrypted_user_token ?? null,
  };
}

// ── Accounts due for validation ───────────────────────────────────────────────

export async function listAccountsDueForValidation(limit = 50): Promise<SocialAccount[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('social_accounts')
    .select(SAFE_SELECT)
    .in('status', ['active', 'warning', 'expired'])
    .or(
      `next_validation_at.is.null,next_validation_at.lt.${new Date().toISOString()}`
    )
    .order('next_validation_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`[socialAccounts] listDueForValidation: ${error.message}`);
  return (data ?? []) as unknown as SocialAccount[];
}

// ── Refresh encrypted user token ──────────────────────────────────────────────

export async function updateEncryptedUserToken(
  accountId: string,
  encryptedToken: string,
  expiresAt: Date | null,
  issuedAt: Date,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  await supabase
    .from('social_accounts')
    .update({
      encrypted_user_token: encryptedToken,
      token_expires_at:     expiresAt?.toISOString() ?? null,
      token_issued_at:      issuedAt.toISOString(),
      token_type:           expiresAt ? 'long_lived' : 'never_expires',
    })
    .eq('id', accountId);
}

// ── Get user's default organization ──────────────────────────────────────────

export async function getUserDefaultOrganization(
  userId: string,
): Promise<{ id: string; name: string; role: string } | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(id, name)')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) return null;

  const org = data.organizations as unknown as { id: string; name: string } | null;
  if (!org) return null;

  return { id: org.id, name: org.name, role: data.role };
}
