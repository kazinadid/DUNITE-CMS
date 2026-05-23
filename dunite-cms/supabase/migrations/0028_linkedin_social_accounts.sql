-- ============================================================================
-- DUNITE CMS — LinkedIn social accounts: additional columns + indexes
-- ============================================================================
-- Adds LinkedIn-specific columns to support organization URNs and member IDs.
-- Safe to run on both fresh and existing environments (IF NOT EXISTS).
-- ============================================================================


-- ── 1. Add LinkedIn-specific columns ──────────────────────────────────────────

alter table public.social_accounts
  add column if not exists organization_urn text,
  add column if not exists linkedin_member_id text;


-- ── 2. Add comments for documentation ─────────────────────────────────────────

comment on column public.social_accounts.organization_urn is
  'LinkedIn Organization URN (e.g., urn:li:organization:123456). Used for organization-scoped posting.';

comment on column public.social_accounts.linkedin_member_id is
  'LinkedIn Member ID from OAuth profile. Identifies the user who connected the account.';


-- ── 3. Indexes for LinkedIn queries ───────────────────────────────────────────

create index if not exists social_accounts_linkedin_org_idx
  on public.social_accounts (platform, organization_urn)
  where platform = 'linkedin';

create index if not exists social_accounts_linkedin_member_idx
  on public.social_accounts (platform, linkedin_member_id)
  where platform = 'linkedin';


-- ── 4. Verification ───────────────────────────────────────────────────────────

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'social_accounts'
  and column_name in ('organization_urn', 'linkedin_member_id')
order by ordinal_position;