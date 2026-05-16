-- ============================================================================
-- DUNITE CMS — Social accounts + OAuth state infrastructure
-- CLEAN RECREATE
-- ============================================================================

-- ── 1. oauth_states ──────────────────────────────────────────────────────────
create table public.oauth_states (
  id              uuid        primary key default gen_random_uuid(),
  state_token     text        not null unique,
  organization_id uuid        not null
    references public.organizations(id) on delete cascade,
  initiated_by    uuid        not null
    references public.users(id) on delete cascade,
  platform        text        not null
    check (platform in ('facebook','instagram','linkedin','twitter','tiktok','youtube')),
  nonce           text        not null,
  expires_at      timestamptz not null,
  used_at         timestamptz,
  completed_at    timestamptz,
  metadata        jsonb       not null default '{}',
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index oauth_states_token_idx   on public.oauth_states (state_token);
create index oauth_states_user_idx    on public.oauth_states (initiated_by);
create index oauth_states_expires_idx on public.oauth_states (expires_at);
create index oauth_states_active_idx  on public.oauth_states (expires_at)
  where used_at is null;

alter table public.oauth_states enable row level security;

create policy "oauth_states: owner reads"
  on public.oauth_states for select
  to authenticated
  using ( initiated_by = auth.uid() );

create policy "oauth_states: admin reads"
  on public.oauth_states for select
  to authenticated
  using ( public.current_user_role() = 'admin' or public.is_super_admin() );

create policy "oauth_states: owner inserts"
  on public.oauth_states for insert
  to authenticated
  with check ( initiated_by = auth.uid() );


-- ── 2. social_accounts ───────────────────────────────────────────────────────
create table public.social_accounts (
  id                        uuid        primary key default gen_random_uuid(),
  organization_id           uuid        not null
    references public.organizations(id) on delete cascade,
  connected_by              uuid        not null
    references public.users(id) on delete restrict,
  platform                  text        not null
    check (platform in ('facebook','instagram','linkedin','twitter','tiktok','youtube')),
  account_type              text        not null default 'page'
    check (account_type in ('page','profile','channel')),
  external_id               text        not null,
  external_name             text        not null,
  external_category         text,
  page_url                  text,
  profile_image_url         text,
  status                    text        not null default 'active'
    check (status in (
      'active','expired','disconnected',
      'reconnect_required','pending_selection','error'
    )),
  health_status             text        not null default 'healthy'
    check (health_status in (
      'healthy','warning','expired','disconnected',
      'permission_error','reconnect_required'
    )),
  encrypted_page_token      text,
  encrypted_user_token      text,
  token_expires_at          timestamptz,
  token_type                text
    check (token_type in ('long_lived','short_lived','never_expires')),
  token_issued_at           timestamptz,
  granted_scopes            text[]      not null default '{}',
  permissions_metadata      jsonb       not null default '{}',
  page_metadata             jsonb       not null default '{}',
  last_validated_at         timestamptz,
  last_validation_error     text,
  next_validation_at        timestamptz,
  validation_attempt_count  int         not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  disconnected_at           timestamptz,
  unique (organization_id, platform, external_id)
);

create index social_accounts_org_idx      on public.social_accounts (organization_id);
create index social_accounts_platform_idx on public.social_accounts (platform, organization_id);
create index social_accounts_status_idx   on public.social_accounts (status);
create index social_accounts_health_idx   on public.social_accounts (health_status);
create index social_accounts_next_val_idx on public.social_accounts (next_validation_at)
  where next_validation_at is not null;
create index social_accounts_connected_by on public.social_accounts (connected_by);

alter table public.social_accounts enable row level security;

create trigger social_accounts_touch
  before update on public.social_accounts
  for each row execute function public.touch_updated_at();

create policy "social_accounts: org admin manages"
  on public.social_accounts for all
  to authenticated
  using      ( public.can_manage_integration(organization_id) )
  with check ( public.can_manage_integration(organization_id) );


-- ── 3. Safe view ─────────────────────────────────────────────────────────────
create view public.social_accounts_safe
with (security_barrier = true)
as
select
  sa.id,
  sa.organization_id,
  sa.connected_by,
  sa.platform,
  sa.account_type,
  sa.external_id,
  sa.external_name,
  sa.external_category,
  sa.page_url,
  sa.profile_image_url,
  sa.status,
  sa.health_status,
  sa.token_expires_at,
  sa.token_type,
  sa.token_issued_at,
  sa.granted_scopes,
  sa.permissions_metadata,
  sa.page_metadata,
  sa.last_validated_at,
  sa.last_validation_error,
  sa.next_validation_at,
  sa.validation_attempt_count,
  sa.created_at,
  sa.updated_at,
  sa.disconnected_at
from public.social_accounts sa
where
  public.is_org_member(sa.organization_id)
  or public.is_super_admin()
  or public.current_user_role() = 'admin';

revoke select on public.social_accounts      from authenticated;
grant  select on public.social_accounts_safe to   authenticated;


-- ── 4. Activity log policy ───────────────────────────────────────────────────
drop policy if exists "activity_logs: select scoped" on public.activity_logs;

create policy "activity_logs: select scoped"
  on public.activity_logs for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    or public.is_super_admin()
    or (
      entity_type = 'post'
      and entity_id is not null
      and exists (select 1 from public.posts p where p.id = entity_id)
    )
    or (
      entity_type = 'media'
      and entity_id is not null
      and (
        exists (select 1 from public.media m where m.id = entity_id)
        or (
          action_type = 'media.library_deleted'
          and coalesce(metadata->>'library_owner_id', '') <> ''
          and (metadata->>'library_owner_id')::uuid = auth.uid()
        )
      )
    )
    or (
      entity_type = 'post_platform'
      and entity_id is not null
      and exists (select 1 from public.posts p where p.id = entity_id)
    )
    or (
      entity_type = 'user'
      and entity_id is not null
      and (
        entity_id = auth.uid()
        or public.current_user_role() = 'admin'
      )
    )
    or (
      entity_type = 'social_account'
      and (
        user_id = auth.uid()
        or public.current_user_role() = 'admin'
        or (
          entity_id is not null
          and exists (
            select 1 from public.social_accounts sa
            join public.organization_members om
              on om.organization_id = sa.organization_id
              and om.user_id = auth.uid()
            where sa.id = entity_id
          )
        )
      )
    )
  );


-- ── 5. Cleanup RPC ───────────────────────────────────────────────────────────
create or replace function public.oauth_states_cleanup()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.oauth_states
  where expires_at < now() - interval '1 hour'
     or (completed_at is not null and created_at < now() - interval '24 hours');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.oauth_states_cleanup() from public;
revoke all on function public.oauth_states_cleanup() from authenticated;
grant  execute on function public.oauth_states_cleanup() to service_role;


-- ── 6. Final verification ────────────────────────────────────────────────────
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('oauth_states','social_accounts','organization_members')
  and column_name = 'organization_id'
order by table_name;