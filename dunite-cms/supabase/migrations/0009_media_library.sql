-- ============================================================================
--  DUNITE CMS — Media Library V2 (categories, thumbnails, library-scoped rows)
-- ============================================================================
--  Backward compatible: existing media rows keep post_id + is_library = false.
--  New library-only uploads use is_library = true and post_id IS NULL.
-- ============================================================================

-- ── 1. Virtual folder / category labels (flat list, no nested trees) ───────

create table if not exists public.media_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  sort_order  int not null default 0
);

insert into public.media_categories (slug, label, sort_order) values
  ('uncategorized', 'Uncategorized', 0),
  ('campaigns',     'Campaigns',     10),
  ('products',      'Products',      20),
  ('videos',        'Videos',        30),
  ('brand_assets',  'Brand assets',  40),
  ('social_posts',  'Social posts',  50)
on conflict (slug) do update set
  label      = excluded.label,
  sort_order = excluded.sort_order;

alter table public.media_categories enable row level security;

drop policy if exists "media_categories: read authed" on public.media_categories;
create policy "media_categories: read authed"
  on public.media_categories for select
  to authenticated
  using ( true );

-- ── 2. Extend public.media (nullable additions preserve existing rows) ──────

alter table public.media add column if not exists category_id uuid
  references public.media_categories(id) on delete set null;

alter table public.media add column if not exists thumbnail_url   text;
alter table public.media add column if not exists thumbnail_path text;
alter table public.media add column if not exists is_library     boolean not null default false;

comment on column public.media.is_library is
  'true = asset lives in the central library (no post); false = attached to post_id as today';

alter table public.media drop constraint if exists media_post_or_library_ck;

alter table public.media alter column post_id drop not null;

alter table public.media add constraint media_post_or_library_ck check (
  (is_library is not true and post_id is not null)
  or (is_library = true and post_id is null)
);

create index if not exists media_user_library_created_idx
  on public.media (user_id, is_library, created_at desc);

create index if not exists media_category_idx
  on public.media (category_id)
  where category_id is not null;

create index if not exists media_file_type_idx
  on public.media (file_type);

-- ── 3. RLS — media (replace writer policies; keep read open for authed) ─────

drop policy if exists "media: writers insert" on public.media;
drop policy if exists "media: writers update" on public.media;
drop policy if exists "media: writers delete" on public.media;

create policy "media: writers insert"
  on public.media for insert
  to authenticated
  with check (
    (
      coalesce(is_library, false) = false
      and post_id is not null
      and public.can_manage_post(post_id)
    )
    or (
      is_library = true
      and post_id is null
      and user_id = auth.uid()
      and public.current_user_role() in ('editor', 'admin')
    )
  );

create policy "media: writers update"
  on public.media for update
  to authenticated
  using (
    (
      coalesce(is_library, false) = false
      and public.can_manage_post(post_id)
    )
    or (
      is_library = true
      and (
        public.current_user_role() = 'admin'
        or (user_id = auth.uid() and public.current_user_role() in ('editor', 'admin'))
      )
    )
  )
  with check (
    (
      coalesce(is_library, false) = false
      and post_id is not null
      and public.can_manage_post(post_id)
    )
    or (
      is_library = true
      and post_id is null
      and (
        public.current_user_role() = 'admin'
        or (user_id = auth.uid() and public.current_user_role() in ('editor', 'admin'))
      )
    )
  );

create policy "media: writers delete"
  on public.media for delete
  to authenticated
  using (
    (
      coalesce(is_library, false) = false
      and public.can_manage_post(post_id)
    )
    or (
      is_library = true
      and (
        public.current_user_role() = 'admin'
        or (user_id = auth.uid() and public.current_user_role() in ('editor', 'admin'))
      )
    )
  );
