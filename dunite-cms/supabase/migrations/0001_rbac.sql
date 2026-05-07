-- ============================================================================
--  Dunite CMS — RBAC schema, defaults, and Row Level Security
-- ============================================================================
--
--  This migration is idempotent — safe to run repeatedly during development.
--  Run it from the Supabase SQL editor or via `supabase db push`.
--
--  Roles
--  -----
--    admin   : full access (manage users, posts, social accounts)
--    editor  : manage posts + media; cannot manage users or social
--    viewer  : read-only
--
--  The DB is the security boundary.  Frontend role checks (in src/lib/rbac.ts)
--  are for UX only — these RLS policies are what actually protects data.
-- ============================================================================


-- ── 1. Role enum ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'editor', 'viewer');
  end if;
end $$;


-- ── 2. users table ──────────────────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text,
  role        public.user_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);


-- ── 3. posts table ──────────────────────────────────────────────────────────
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  content       text not null,
  status        text not null default 'draft' check (status in ('draft','scheduled','published')),
  scheduled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists posts_user_id_idx on public.posts (user_id);
create index if not exists posts_status_idx  on public.posts (status);


-- ── 4. Auto-create a `public.users` row when a new auth user signs up ───────
--      Default role is 'viewer'.  Admins must promote users explicitly.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ── 5. Helper: current user's role ──────────────────────────────────────────
--      `security definer` lets RLS policies call this without recursion.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;


-- ── 6. Enable RLS ───────────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.posts enable row level security;


-- ── 7. RLS — public.users ───────────────────────────────────────────────────

drop policy if exists "users: read own profile"  on public.users;
drop policy if exists "users: admin reads all"   on public.users;
drop policy if exists "users: insert own row"    on public.users;
drop policy if exists "users: update own name"   on public.users;
drop policy if exists "users: admin updates any" on public.users;
drop policy if exists "users: admin deletes"     on public.users;

-- Read your own row.
create policy "users: read own profile"
  on public.users for select
  using ( auth.uid() = id );

-- Admins can read every row.
create policy "users: admin reads all"
  on public.users for select
  using ( public.current_user_role() = 'admin' );

-- Allow the auth-trigger / signup flow to create your own profile.
create policy "users: insert own row"
  on public.users for insert
  with check ( auth.uid() = id );

-- Users may update their own non-sensitive fields (name).  The role check
-- below makes role updates by non-admins fail at the row level.
create policy "users: update own name"
  on public.users for update
  using ( auth.uid() = id )
  with check (
    auth.uid() = id
    -- prevent self-promotion: role must remain unchanged
    and role = (select role from public.users where id = auth.uid())
  );

-- Admins can update any row, including role.
create policy "users: admin updates any"
  on public.users for update
  using ( public.current_user_role() = 'admin' )
  with check ( public.current_user_role() = 'admin' );

-- Admins can delete users (cascades to posts).
create policy "users: admin deletes"
  on public.users for delete
  using ( public.current_user_role() = 'admin' );


-- ── 8. RLS — public.posts ───────────────────────────────────────────────────

drop policy if exists "posts: read all authed"   on public.posts;
drop policy if exists "posts: writers insert"    on public.posts;
drop policy if exists "posts: writers update"    on public.posts;
drop policy if exists "posts: writers delete"    on public.posts;

-- Any logged-in user (including viewers) can READ posts.
create policy "posts: read all authed"
  on public.posts for select
  to authenticated
  using ( true );

-- Only admin/editor can INSERT, and only as themselves.
create policy "posts: writers insert"
  on public.posts for insert
  with check (
    auth.uid() = user_id
    and public.current_user_role() in ('admin', 'editor')
  );

-- Editors can update their own posts; admins can update any.
create policy "posts: writers update"
  on public.posts for update
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'editor' and auth.uid() = user_id)
  )
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'editor' and auth.uid() = user_id)
  );

-- Same rule for delete.
create policy "posts: writers delete"
  on public.posts for delete
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'editor' and auth.uid() = user_id)
  );


-- ── 9. updated_at triggers (nice-to-have) ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_touch on public.users;
create trigger users_touch
  before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch
  before update on public.posts
  for each row execute function public.touch_updated_at();
