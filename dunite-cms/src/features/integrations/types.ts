// ============================================================================
// DUNITE CMS — Social Integrations: Shared Types
// ============================================================================

// ── Platform identifiers ──────────────────────────────────────────────────────

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'youtube';

export type AccountType = 'page' | 'profile' | 'channel';

// ── Status enums ──────────────────────────────────────────────────────────────

export type SocialAccountStatus =
  | 'active'
  | 'expired'
  | 'disconnected'
  | 'reconnect_required'
  | 'pending_selection'
  | 'error';

export type AccountHealthStatus =
  | 'healthy'
  | 'warning'
  | 'expired'
  | 'disconnected'
  | 'permission_error'
  | 'reconnect_required';

export type TokenType = 'long_lived' | 'short_lived' | 'never_expires';

// ── Organization types ────────────────────────────────────────────────────────

export type OrgRole = 'admin' | 'editor' | 'viewer';
export type PlatformRole = 'super_admin';

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: string;
}

// ── Social account (safe — no tokens) ────────────────────────────────────────

export interface SocialAccount {
  id: string;
  organization_id: string;
  connected_by: string;
  platform: SocialPlatform;
  provider?: SocialPlatform;
  account_type: AccountType;
  external_id: string;
  external_name: string;
  page_id?: string | null;
  page_name?: string | null;
  facebook_user_id?: string | null;
  external_category: string | null;
  page_url: string | null;
  profile_image_url: string | null;
  status: SocialAccountStatus;
  health_status: AccountHealthStatus;
  token_expires_at: string | null;
  token_type: TokenType | null;
  token_issued_at: string | null;
  granted_scopes: string[];
  permissions_metadata: Record<string, unknown>;
  page_metadata: Record<string, unknown>;
  last_validated_at: string | null;
  last_validation_error: string | null;
  next_validation_at: string | null;
  validation_attempt_count: number;
  created_at: string;
  updated_at: string;
  disconnected_at: string | null;
}

// ── Facebook Graph API types ──────────────────────────────────────────────────

/** A Facebook Page returned by /me/accounts */
export interface FacebookPageResponse {
  id: string;
  name: string;
  category: string;
  access_token: string;
  tasks: string[];
  picture?: { data: { url: string; width: number; height: number } };
  fan_count?: number;
  followers_count?: number;
  link?: string;
}

/** Normalized page data stored in oauth_states.metadata during selection */
export interface PendingFacebookPage {
  id: string;
  name: string;
  category: string;
  /** Encrypted page access token — never expose raw value */
  encrypted_access_token: string;
  picture_url: string | null;
  fan_count: number | null;
  followers_count: number | null;
  page_url: string | null;
  tasks: string[];
}

/** Normalized organization data stored in oauth_states.metadata during LinkedIn selection */
export interface PendingLinkedInOrganization {
  urn: string;             // organization URN (e.g., urn:li:organization:123456)
  name: string;
  logo_url: string | null;
  /** Encrypted organization access token — never expose raw value */
  encrypted_access_token: string;
  role: string;            // ADMIN role
}

/** Debug token response from Graph API */
export interface FacebookTokenDebugResponse {
  data: {
    app_id: string;
    is_valid: boolean;
    expires_at: number;
    issued_at: number;
    scopes: string[];
    user_id: string;
    type: string;
    error?: { code: number; message: string; subcode?: number };
  };
}

/** /me/permissions response */
export interface FacebookPermissionsResponse {
  data: Array<{ permission: string; status: 'granted' | 'declined' }>;
}

// ── OAuth flow types ──────────────────────────────────────────────────────────

export interface OAuthState {
  id: string;
  state_token: string;
  organization_id: string;
  initiated_by: string;
  platform: SocialPlatform;
  nonce: string;
  expires_at: string;
  used_at: string | null;
  completed_at: string | null;
  metadata: OAuthStateMetadata;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface OAuthStateMetadata {
  /** Present after code exchange — encrypted user access token */
  encrypted_user_token?: string;
  /** Present after code exchange — token expiry info */
  token_expires_at?: string | null;
  token_type?: TokenType;
  token_issued_at?: string;
  /** Facebook User ID from Graph `/me` after OAuth */
  facebook_user_id?: string;
  /** LinkedIn Member ID from OAuth profile */
  linkedin_member_id?: string;
  /** Available pages (with encrypted page tokens) — Facebook */
  pages?: PendingFacebookPage[];
  /** Available organizations (with encrypted tokens) — LinkedIn */
  organizations?: PendingLinkedInOrganization[];
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export interface DiagnosticsResult {
  accountId: string;
  platform: SocialPlatform;
  externalId: string;
  checkedAt: Date;
  isValid: boolean;
  healthStatus: AccountHealthStatus;
  issues: DiagnosticsIssue[];
  grantedScopes: string[];
  missingScopes: string[];
  tokenExpiresAt: Date | null;
  tokenDaysRemaining: number | null;
  rawDebug?: Record<string, unknown>;
}

export type DiagnosticsIssueKind =
  | 'token_expired'
  | 'token_expiring_soon'
  | 'permission_revoked'
  | 'scope_missing'
  | 'page_not_accessible'
  | 'graph_api_error'
  | 'app_misconfigured'
  | 'invalid_token'
  | 'rate_limited';

export interface DiagnosticsIssue {
  kind: DiagnosticsIssueKind;
  message: string;
  /** Machine-readable detail for logging */
  detail?: string;
  recoverable: boolean;
}

// ── Required OAuth scopes ─────────────────────────────────────────────────────

export const FACEBOOK_REQUIRED_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'business_management',
] as const;

export type FacebookScope = (typeof FACEBOOK_REQUIRED_SCOPES)[number];

// ── Action result types ───────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface ConnectFacebookResult {
  authUrl: string;
}

export interface PageSelectionResult {
  connected: SocialAccount[];
  skipped: string[];
}

// ── Background job payload ────────────────────────────────────────────────────

export interface TokenValidationJobPayload {
  accountId: string;
  organizationId: string;
  platform: SocialPlatform;
  force?: boolean;
}
