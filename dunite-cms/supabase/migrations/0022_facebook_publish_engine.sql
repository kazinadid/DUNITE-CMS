-- ============================================================================
-- DUNITE CMS — Facebook social publishing columns + RPCs + indexes (FIXED)
-- ============================================================================
-- Fixes:
--   1. publish_locked_by changed to text (cron-worker compatibility)
--   2. Dependency guards for can_manage_post(), publishing_jobs, post_platforms
--   3. Backfill NULL safety for user_id
--   4. list_due_publishing_jobs changed to volatile
-- ============================================================================


-- ── 0. Dependency guards ─────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'can_manage_post'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception
      'MISSING DEPENDENCY: public.can_manage_post() does not exist.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'publishing_jobs'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.publishing_jobs does not exist.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'post_platforms'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.post_platforms does not exist.';
  end if;
end $$;


-- ── 1. Posts columns ─────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

alter table public.posts
  add column if not exists external_post_id text;

alter table public.posts
  add column if not exists social_account_id uuid
    references public.social_accounts(id) on delete set null;

alter table public.posts
  add column if not exists published_by uuid
    references auth.users(id) on delete set null;

alter table public.posts
  add column if not exists publish_metadata jsonb not null default '{}'::jsonb;

alter table public.posts
  add column if not exists last_publish_attempt_at timestamptz;

alter table public.posts
  add column if not exists publish_locked_at timestamptz;

-- FIXED: text instead of uuid — cron-worker is not an auth user
alter table public.posts
  add column if not exists publish_locked_by text;

comment on column public.posts.organization_id is
  'Owning organization for outbound social publishes.';
comment on column public.posts.social_account_id is
  'Target connected social_accounts row when publishing to Facebook.';
comment on column public.posts.external_post_id is
  'Provider post id returned by Meta Graph. Never store tokens here.';
comment on column public.posts.publish_metadata is
  'Non-sensitive outbound publish meta (omit tokens).';
comment on column public.posts.publish_locked_by is
  'Process that acquired the lock: cron-worker, manual, or auth.uid()::text';


-- ── 2. Indexes ───────────────────────────────────────────────────────────────
create index if not exists posts_organization_id_idx
  on public.posts (organization_id);

create index if not exists posts_social_account_id_idx
  on public.posts (social_account_id)
  where social_account_id is not null;

create index if not exists posts_scheduled_publish_idx
  on public.posts (organization_id, status, scheduled_at)
  where status in ('scheduled','queued')
    and scheduled_at is not null;

create index if not exists posts_failed_retry_idx
  on public.posts (organization_id, status, publish_attempt_count, updated_at)
  where status in ('failed','retrying');

create index if not exists posts_publish_lock_stale_idx
  on public.posts (publish_locked_at asc)
  where publish_locked_at is not null;


-- ── 3. Backfill organization_id (FIXED: null safety) ─────────────────────────
update public.posts p
set organization_id = m.organization_id
from (
  select
    user_id,
    organization_id,
    row_number() over (
      partition by user_id
      order by joined_at asc nulls last, organization_id
    ) as rn
  from public.organization_members
  where user_id is not null
) m
where p.organization_id is null
  and p.user_id is not null
  and p.user_id = m.user_id
  and m.rn = 1;


-- ── 4. replace_publishing_jobs RPC ───────────────────────────────────────────
create or replace function public.replace_publishing_jobs(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p_record public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.can_manage_post(p_post_id) then
    raise exception 'forbidden';
  end if;

  select *
  into p_record
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'post_not_found';
  end if;

  delete from public.publishing_jobs
  where post_id = p_post_id;

  if p_record.status in ('draft', 'cancelled', 'published')
     or not exists (
       select 1 from public.post_platforms pp
       where pp.post_id = p_post_id
     ) then
    return;
  end if;

  insert into public.publishing_jobs (
    post_id,
    platform,
    status,
    attempt_count,
    max_attempts,
    scheduled_for,
    last_error,
    next_retry_at,
    started_at,
    completed_at,
    updated_at
  )
  select
    p_post_id,
    pp.platform,
    'queued'::text,
    0,
    5,
    coalesce(p_record.scheduled_at, now()),
    null::text,
    null::timestamptz,
    null::timestamptz,
    null::timestamptz,
    now()
  from public.post_platforms pp
  where pp.post_id = p_post_id;
end;
$$;

revoke execute on function public.replace_publishing_jobs(uuid) from public;
grant execute on function public.replace_publishing_jobs(uuid) to authenticated;


-- ── 5. list_due_publishing_jobs RPC (FIXED: volatile) ────────────────────────
create or replace function public.list_due_publishing_jobs(
  p_limit integer default 50,
  p_platform text default null
)
returns table (
  id uuid,
  post_id uuid,
  platform text,
  status text,
  attempt_count integer,
  max_attempts integer,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  next_retry_at timestamptz,
  updated_at timestamptz
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    pj.id,
    pj.post_id,
    pj.platform,
    pj.status,
    pj.attempt_count,
    pj.max_attempts,
    pj.scheduled_for,
    pj.started_at,
    pj.completed_at,
    pj.last_error,
    pj.next_retry_at,
    pj.updated_at
  from public.publishing_jobs pj
  inner join public.posts po on po.id = pj.post_id
  where pj.status in ('queued', 'retrying')
    and pj.scheduled_for <= now()
    and (p_platform is null or pj.platform = p_platform)
    and (
      po.publish_locked_at is null
      or po.publish_locked_at < now() - interval '5 minutes'
    )
  order by pj.scheduled_for asc, pj.updated_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_due_publishing_jobs(integer, text)
  from public;
grant execute on function public.list_due_publishing_jobs(integer, text)
  to service_role;


-- ── 6. Verification ──────────────────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
  and column_name in (
    'organization_id', 'external_post_id', 'social_account_id',
    'published_by', 'publish_metadata', 'last_publish_attempt_at',
    'publish_locked_at', 'publish_locked_by'
  )
order by column_name;