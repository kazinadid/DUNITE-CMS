-- ============================================================================
--  Dunite CMS — Posts auxiliary tables: post_platforms, media + RLS
-- ============================================================================
--
--  Companion to 0001_rbac.sql.  Idempotent — safe to run repeatedly.
--
--  These tables are written to by the composer at /dashboard/posts/compose:
--    - post_platforms : one row per (post, platform) the post should publish to
--    - media          : one row per uploaded image attached to a post
--
--  Both are protected by RLS that defers to the parent post:
--    - any authenticated user may SELECT
--    - INSERT / UPDATE / DELETE only by the post's owner (editor) or admin
-- ============================================================================


-- ── 1. post_platforms ───────────────────────────────────────────────────────
create table if not exists public.post_platforms (
  post_id    uuid not null references public.posts(id) on delete cascade,
  platform   text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, platform)
);

create index if not exists post_platforms_post_id_idx on public.post_platforms (post_id);


-- ── 2. media ────────────────────────────────────────────────────────────────
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now()
);

create index if not exists media_post_id_idx on public.media (post_id);


-- ── 3. RLS — enable ─────────────────────────────────────────────────────────
alter table public.post_platforms enable row level security;
alter table public.media          enable row level security;


-- ── 4. Helper predicate: can the current user manage this post? ────────────
--      Same rule the posts-table policies use, just centralised so
--      post_platforms / media policies stay readable.
create or replace function public.can_manage_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and (
        public.current_user_role() = 'admin'
        or (public.current_user_role() = 'editor' and p.user_id = auth.uid())
      )
  );
$$;

revoke all on function public.can_manage_post(uuid) from public;
grant execute on function public.can_manage_post(uuid) to authenticated;


-- ── 5. RLS — post_platforms ────────────────────────────────────────────────
drop policy if exists "post_platforms: read all authed" on public.post_platforms;
drop policy if exists "post_platforms: writers insert" on public.post_platforms;
drop policy if exists "post_platforms: writers update" on public.post_platforms;
drop policy if exists "post_platforms: writers delete" on public.post_platforms;

create policy "post_platforms: read all authed"
  on public.post_platforms for select
  to authenticated
  using ( true );

create policy "post_platforms: writers insert"
  on public.post_platforms for insert
  with check ( public.can_manage_post(post_id) );

create policy "post_platforms: writers update"
  on public.post_platforms for update
  using      ( public.can_manage_post(post_id) )
  with check ( public.can_manage_post(post_id) );

create policy "post_platforms: writers delete"
  on public.post_platforms for delete
  using ( public.can_manage_post(post_id) );


-- ── 6. RLS — media ─────────────────────────────────────────────────────────
drop policy if exists "media: read all authed" on public.media;
drop policy if exists "media: writers insert" on public.media;
drop policy if exists "media: writers update" on public.media;
drop policy if exists "media: writers delete" on public.media;

create policy "media: read all authed"
  on public.media for select
  to authenticated
  using ( true );

create policy "media: writers insert"
  on public.media for insert
  with check ( public.can_manage_post(post_id) );

create policy "media: writers update"
  on public.media for update
  using      ( public.can_manage_post(post_id) )
  with check ( public.can_manage_post(post_id) );

create policy "media: writers delete"
  on public.media for delete
  using ( public.can_manage_post(post_id) );


-- ============================================================================
--  Storage bucket (for media uploads)
-- ============================================================================
--  The composer uploads files to the `media` storage bucket.  Storage buckets
--  cannot be created idempotently from SQL the same way tables can, so this
--  block uses an exception-safe insert.  If you prefer, create the bucket
--  via the Supabase dashboard (Storage → New bucket, name "media", Public) and
--  skip this section.
-- ============================================================================
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;
exception when others then
  -- e.g. permission denied if running without the service role; ignore.
  raise notice 'Skipped storage bucket creation: %', sqlerrm;
end $$;


-- ── Storage RLS (anon/authenticated read, authenticated write) ───────────────
--  These policies apply to files inside the `media` bucket.
--  "service_role" always bypasses RLS, so the policies only affect client
--  requests made with the anon or authenticated JWT.

drop policy if exists "media bucket: public read"          on storage.objects;
drop policy if exists "media bucket: authenticated upload" on storage.objects;
drop policy if exists "media bucket: owner update"         on storage.objects;
drop policy if exists "media bucket: owner delete"         on storage.objects;

create policy "media bucket: public read"
  on storage.objects for select
  using ( bucket_id = 'media' );

create policy "media bucket: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'media' );

create policy "media bucket: owner update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1] );

create policy "media bucket: owner delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1] );
