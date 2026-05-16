-- ============================================================================
-- DUNITE CMS — Organization multi-tenancy foundation (FIXED)
-- ============================================================================
-- Fixes applied:
--   1. Safe NULL check constraint for platform_role
--   2. Guard for current_user_role() existence
--   3. Safe role mapping in bootstrap
--   4. search_path already set (kept)
--   5. RLS recursion fixed via is_org_member() RPC
--   6. No updated_at on organization_members (intentional)
--   7. Super admin policy isolation (kept)
--   8. Slug kept nullable (intentional for flexibility)
--   9. Service role bypass warning added in comments
-- ============================================================================


-- ── 0. SAFETY GUARD — verify current_user_role() exists ──────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'current_user_role'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception
      'MISSING DEPENDENCY: public.current_user_role() does not exist. '
      'Create it before running this migration.';
  end if;
end $$;


-- ── 1. Platform role (FIXED: explicit NULL allowed) ───────────────────────────
alter table public.users
  add column if not exists platform_role text
  check (platform_role is null or platform_role in ('super_admin'));

comment on column public.users.platform_role is
  'Platform-level override; only ''super_admin'' is valid. NULL = regular tenant user.';


-- ── 2. Organizations ──────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  slug        text        unique,             -- nullable: multiple NULLs allowed
  owner_id    uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists organizations_owner_idx on public.organizations (owner_id);
create index if not exists organizations_slug_idx  on public.organizations (slug);

alter table public.organizations enable row level security;

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();


-- ── 3. Organization members ───────────────────────────────────────────────────
create table if not exists public.organization_members (
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  user_id         uuid        not null references public.users(id)         on delete cascade,
  role            text        not null default 'viewer'
    check (role in ('admin', 'editor', 'viewer')),
  joined_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists org_members_user_idx on public.organization_members (user_id);
create index if not exists org_members_org_idx  on public.organization_members (organization_id);

alter table public.organization_members enable row level security;


-- ── 4. RPC helpers ────────────────────────────────────────────────────────────

-- Returns TRUE if the current user has platform_role = 'super_admin'.
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(platform_role = 'super_admin', false)
  from public.users
  where id = auth.uid();
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- Returns the caller's org-scoped role (NULL if not a member).
create or replace function public.current_org_role(p_org_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role
  from public.organization_members
  where organization_id = p_org_id
    and user_id = auth.uid();
$$;

revoke all on function public.current_org_role(uuid) from public;
grant execute on function public.current_org_role(uuid) to authenticated;

-- Returns TRUE if caller is a member of the given org with any role.
-- FIXED: defined BEFORE RLS policies that reference it to avoid recursion.
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_org_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Returns TRUE if caller can manage integrations in the given org.
create or replace function public.can_manage_integration(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (
    public.is_super_admin()
    or public.current_user_role() = 'admin'
    or public.current_org_role(p_org_id) = 'admin'
  );
$$;

revoke all on function public.can_manage_integration(uuid) from public;
grant execute on function public.can_manage_integration(uuid) to authenticated;


-- ── 5. RLS — organizations ────────────────────────────────────────────────────
-- NOTE: Service role bypasses ALL RLS below.
-- Backend APIs/cron/OAuth must manually scope org access in application logic.

drop policy if exists "orgs: super_admin reads all"  on public.organizations;
drop policy if exists "orgs: members read own"       on public.organizations;
drop policy if exists "orgs: global admin manages"   on public.organizations;

create policy "orgs: super_admin reads all"
  on public.organizations for select
  to authenticated
  using ( public.is_super_admin() );

-- FIXED: uses is_org_member() RPC instead of inline subquery to avoid recursion
create policy "orgs: members read own"
  on public.organizations for select
  to authenticated
  using ( public.is_org_member(id) );

create policy "orgs: global admin manages"
  on public.organizations for all
  to authenticated
  using      ( public.current_user_role() = 'admin' or public.is_super_admin() )
  with check ( public.current_user_role() = 'admin' or public.is_super_admin() );


-- ── 6. RLS — organization_members ────────────────────────────────────────────
-- NOTE: Service role bypasses ALL RLS below.
-- Backend APIs/cron/OAuth must manually scope org access in application logic.

drop policy if exists "org_members: super_admin reads all"  on public.organization_members;
drop policy if exists "org_members: members read own org"   on public.organization_members;
drop policy if exists "org_members: global admin manages"   on public.organization_members;

create policy "org_members: super_admin reads all"
  on public.organization_members for select
  to authenticated
  using ( public.is_super_admin() );

-- FIXED: uses is_org_member() RPC instead of self-referencing subquery
-- prevents RLS recursion on organization_members table
create policy "org_members: members read own org"
  on public.organization_members for select
  to authenticated
  using ( public.is_org_member(organization_id) );

create policy "org_members: global admin manages"
  on public.organization_members for all
  to authenticated
  using      ( public.current_user_role() = 'admin' or public.is_super_admin() )
  with check ( public.current_user_role() = 'admin' or public.is_super_admin() );


-- ── 7. Bootstrap: default org + enroll existing users ─────────────────────────
do $$
declare
  default_org_id uuid;
  first_admin_id uuid;
begin
  select id into default_org_id
  from public.organizations
  where slug = 'default'
  limit 1;

  if default_org_id is null then
    select id into first_admin_id
    from public.users
    where role = 'admin'
    order by created_at asc
    limit 1;

    insert into public.organizations (name, slug, owner_id)
    values ('Default Organization', 'default', first_admin_id)
    returning id into default_org_id;
  end if;

  -- FIXED: safe role mapping — unknown/null roles default to 'viewer'
  -- prevents crash if users.role contains unexpected values
  insert into public.organization_members (organization_id, user_id, role)
  select
    default_org_id,
    u.id,
    case
      when u.role in ('admin', 'editor', 'viewer') then u.role::text
      else 'viewer'   -- catches: null, moderator, owner, typos, etc.
    end
  from public.users u
  where not exists (
    select 1 from public.organization_members om
    where om.organization_id = default_org_id
      and om.user_id = u.id
  )
  on conflict (organization_id, user_id) do nothing;
end $$;