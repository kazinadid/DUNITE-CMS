-- ============================================================================
--  Dunite CMS — Publish audit + feed sort helper + lightweight event log
-- ============================================================================
--  Columns are optional telemetry for workers; CMS reads them when set.
--  `post_publish_events` is append-only from the backend (service role); users
--  can SELECT rows for posts they can already read via RLS on `posts`.
-- ============================================================================

alter table public.posts
  add column if not exists last_publish_error text;

alter table public.posts
  add column if not exists publish_attempt_count int not null default 0;

-- Stable ordering for "failed first" in the dashboard without fragile text sorts.
alter table public.posts
  add column if not exists failure_sort_key int generated always as (
    case status when 'failed' then 0 else 1 end
  ) stored;


-- ── Event log ───────────────────────────────────────────────────────────────
create table if not exists public.post_publish_events (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('info','warn','error','success')),
  message     text not null
);

create index if not exists post_publish_events_post_id_created_idx
  on public.post_publish_events (post_id, created_at desc);

alter table public.post_publish_events enable row level security;

drop policy if exists "post_publish_events: read all authed" on public.post_publish_events;

create policy "post_publish_events: read all authed"
  on public.post_publish_events for select
  to authenticated
  using ( true );

-- No INSERT/UPDATE/DELETE for JWT clients — publishing workers use service role.
