// ============================================================================
// DUNITE CMS — OAuth adapter (platform-agnostic state machine)
// ============================================================================
// Handles CSRF-safe state generation, validation, and single-use enforcement.
// Designed to be platform-agnostic — Facebook-specific logic is in facebookClient.ts.
// Server-side only.
// ============================================================================

import crypto from 'crypto';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import type { OAuthState, OAuthStateMetadata, SocialPlatform } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_TTL_MINUTES    = 15;   // State expires after 15 minutes
const SELECTION_TTL_MINUTES = 30;  // Page-selection window after code exchange

// ── Generate OAuth state ──────────────────────────────────────────────────────

export interface GenerateStateOptions {
  organizationId: string;
  userId: string;
  platform: SocialPlatform;
  ipAddress?: string;
  userAgent?: string;
}

export interface GeneratedState {
  stateId: string;
  stateToken: string;
  nonce: string;
}

/**
 * Generate a cryptographically random OAuth state token and persist it to DB.
 * Returns the state ID (UUID) and the token (to embed in the OAuth redirect URL).
 */
export async function generateOAuthState(
  opts: GenerateStateOptions,
): Promise<GeneratedState> {
  const stateToken = crypto.randomBytes(32).toString('hex');
  const nonce      = crypto.randomBytes(16).toString('hex');
  const expiresAt  = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000);

  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('oauth_states')
    .insert({
      state_token:     stateToken,
      organization_id: opts.organizationId,
      initiated_by:    opts.userId,
      platform:        opts.platform,
      nonce,
      expires_at:      expiresAt.toISOString(),
      ip_address:      opts.ipAddress ?? null,
      user_agent:      opts.userAgent ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`[oauthAdapter] Failed to persist state: ${error?.message}`);
  }

  console.info(`[oauthAdapter] Generated state for ${opts.platform}, id=${data.id}`);
  return { stateId: data.id as string, stateToken, nonce };
}

// ── Validate and consume state ─────────────────────────────────────────────────

export interface ValidatedState {
  record: OAuthState;
}

/**
 * Validates a state token from the OAuth callback.
 * - Checks existence, expiry, and single-use constraint.
 * - Stamps `used_at` to prevent replay attacks.
 * @throws descriptive error for all invalid cases
 */
export async function validateAndConsumeState(
  stateToken: string,
  expectedPlatform: SocialPlatform,
): Promise<ValidatedState> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: row, error } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('state_token', stateToken)
    .single();

  if (error || !row) {
    throw new Error('[oauthAdapter] CSRF validation failed: unknown state token.');
  }

  if (row.platform !== expectedPlatform) {
    throw new Error(`[oauthAdapter] Platform mismatch: expected ${expectedPlatform}, got ${row.platform}.`);
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new Error('[oauthAdapter] OAuth state token has expired. Please try connecting again.');
  }

  if (row.used_at) {
    throw new Error('[oauthAdapter] Replay attack detected: state token already used.');
  }

  // Stamp as used — prevents any future replay.
  const { error: updateErr } = await supabase
    .from('oauth_states')
    .update({
      used_at:   new Date().toISOString(),
      // Extend expiry to give the user time to select pages.
      expires_at: new Date(Date.now() + SELECTION_TTL_MINUTES * 60 * 1000).toISOString(),
    })
    .eq('id', row.id);

  if (updateErr) {
    console.error('[oauthAdapter] Failed to stamp used_at:', updateErr.message);
  }

  return { record: row as unknown as OAuthState };
}

// ── Load state for page selection ─────────────────────────────────────────────

/**
 * Load an oauth_state record for the page-selection step.
 * Validates: state still valid (not expired), used_at is set (code was exchanged),
 * not yet completed, and belongs to the requesting user.
 */
export async function loadStateForSelection(
  stateId: string,
  userId: string,
): Promise<OAuthState> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: row, error } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('id', stateId)
    .eq('initiated_by', userId)
    .single();

  if (error || !row) {
    throw new Error('[oauthAdapter] Page selection: state not found or does not belong to you.');
  }

  if (new Date(row.expires_at) < new Date()) {
    throw new Error('[oauthAdapter] Page selection session expired. Please reconnect Facebook.');
  }

  if (!row.used_at) {
    throw new Error('[oauthAdapter] Code not yet exchanged for this state.');
  }

  if (row.completed_at) {
    throw new Error('[oauthAdapter] This selection has already been completed.');
  }

  return row as unknown as OAuthState;
}

// ── Persist temporary token data into state metadata ─────────────────────────

export async function persistStateMetadata(
  stateId: string,
  metadata: OAuthStateMetadata,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase
    .from('oauth_states')
    .update({ metadata })
    .eq('id', stateId);

  if (error) {
    throw new Error(`[oauthAdapter] Failed to persist metadata: ${error.message}`);
  }
}

// ── Mark state as fully completed ─────────────────────────────────────────────

export async function completeState(stateId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  await supabase
    .from('oauth_states')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', stateId);
}
