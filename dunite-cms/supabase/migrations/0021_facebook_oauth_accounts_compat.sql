-- ============================================================================
-- DUNITE CMS — Facebook OAuth account compatibility columns (FIXED)
-- ============================================================================
-- Fixes applied:
--   1. pgcrypto extension guard added
--   2. auth.users reference (Supabase standard) instead of public.users
--   3. Legacy backfill UPDATE removed (no old production data to migrate)
--   4. Unique index conflict with existing unique constraint handled safely
--   5. All ALTER columns use IF NOT EXISTS
--   6. provider default set safely after column add
-- ============================================================================

-- ── 0. Extensions ─────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;


-- ── 1. Safety guard — verify dependency tables exist ──────────────────────────
do $$
begin
  -- Verify organizations table exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'organizations'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.organizations does not exist. '
      'Run migration_1_organizations.sql first.';
  end if;

  -- Verify auth.users exists (Supabase standard)
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'auth'
      and table_name = 'users'
  ) then
    raise exception
      'MISSING DEPENDENCY: auth.users does not exist. '
      'Ensure Supabase auth is properly initialized.';
  end if;
end $$;


-- ── 2. Create table if fresh environment ──────────────────────────────────────
-- FIXED: references auth.users(id) instead of public.users(id)
-- Safe for both fresh and existing environments via IF NOT EXISTS

create table if not exists public.social_accounts (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null
    references public.organizations(id) on delete cascade,
  provider        text        not null default 'facebook',
  page_id         text        not null,
  page_name       text        not null,
  access_token    text        not null,
  refresh_token   text,
  metadata        jsonb       not null default '{}',
  connected_by    uuid        not null
    references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);


-- ── 3. Extend existing schema safely ──────────────────────────────────────────
-- All columns use IF NOT EXISTS — safe to run on both fresh and existing tables.
-- REMOVED: legacy backfill UPDATE block (no old production data to migrate).

alter table public.social_accounts
  add column if not exists provider         text,
  add column if not exists page_id          text,
  add column if not exists page_name        text,
  add column if not exists access_token     text,
  add column if not exists refresh_token    text,
  add column if not exists facebook_user_id text,
  add column if not exists metadata         jsonb not null default '{}',
  add column if not exists last_synced_at   timestamptz;

-- Set provider default after column is guaranteed to exist
alter table public.social_accounts
  alter column provider set default 'facebook';


-- ── 4. Indexes ────────────────────────────────────────────────────────────────
create index if not exists social_accounts_provider_org_idx
  on public.social_accounts (provider, organization_id);

create index if not exists social_accounts_page_id_idx
  on public.social_accounts (provider, page_id);

-- Unique index: one page per provider per org
-- Scoped to non-null page_id only — safe for partial schemas
create unique index if not exists social_accounts_provider_page_org_unique
  on public.social_accounts (organization_id, provider, page_id)
  where page_id is not null;


-- ── 5. Comments ───────────────────────────────────────────────────────────────
comment on column public.social_accounts.access_token is
  'Encrypted provider access token. Never store or expose raw OAuth tokens. '
  'Decrypt only in trusted server-side context using SOCIAL_TOKEN_ENCRYPTION_KEY.';

comment on column public.social_accounts.provider is
  'Provider identifier e.g. facebook, instagram, linkedin. '
  'Kept alongside platform column for schema compatibility.';

comment on column public.social_accounts.page_id is
  'Provider page/account identifier e.g. Facebook Page ID.';

comment on column public.social_accounts.facebook_user_id is
  'Facebook user ID returned by /me endpoint during OAuth callback. '
  'Used for token ownership verification only — never exposed to clients.';

comment on column public.social_accounts.refresh_token is
  'Encrypted refresh token if provider supports it. '
  'Facebook long-lived page tokens do not use refresh tokens.';

comment on column public.social_accounts.last_synced_at is
  'Timestamp of last successful token validation or page metadata sync.';


-- ── 6. Verification ───────────────────────────────────────────────────────────
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'social_accounts'
order by ordinal_position;