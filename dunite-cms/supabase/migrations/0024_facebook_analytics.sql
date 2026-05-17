-- ============================================================================
-- DUNITE CMS — Facebook analytics snapshots + sync logs + RLS
-- FIXED VERSION: Security hardened, write policies added, sync state improved
-- ============================================================================

-- ── 0. Posts: sync metadata (nullable, additive) ────────────────────────────
alter table public.posts
  add column if not exists fb_analytics_last_synced_at timestamptz;

alter table public.posts
  add column if not exists fb_analytics_sync_status text;

-- FIX ISSUE 7: Added syncing_started_at for stuck-worker detection
alter table public.posts
  add column if not exists fb_analytics_syncing_started_at timestamptz;

alter table public.posts
  drop constraint if exists posts_fb_analytics_sync_status_check;

alter table public.posts
  add constraint posts_fb_analytics_sync_status_check check (
    fb_analytics_sync_status is null
    or fb_analytics_sync_status in (
      'pending',
      'syncing',
      'synced',
      'failed',
      'stale'
    )
  );

comment on column public.posts.fb_analytics_last_synced_at is
  'UTC timestamp of last successful Facebook insights snapshot persisted for this CMS post.';
comment on column public.posts.fb_analytics_sync_status is
  'Client-facing Facebook analytics sync lifecycle (cron + manual refresh).';
comment on column public.posts.fb_analytics_syncing_started_at is
  'Set when status transitions to syncing. Used to detect stuck workers (e.g. stale after 15min).';


-- ── 1. facebook_post_analytics ─────────────────────────────────────────────
create table if not exists public.facebook_post_analytics (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  post_id            uuid not null references public.posts(id) on delete cascade,
  social_account_id  uuid references public.social_accounts(id) on delete set null,
  external_post_id   text not null,
  impressions        bigint not null default 0,
  reach              bigint not null default 0,
  engagements        bigint not null default 0,
  reactions          bigint not null default 0,
  reactions_by_type  jsonb not null default '{}'::jsonb,
  comments_count     bigint not null default 0,
  shares_count       bigint not null default 0,
  clicks             bigint not null default 0,
  link_clicks        bigint not null default 0,
  video_views        bigint not null default 0,
  engagement_rate    numeric(14, 8),
  ctr                numeric(14, 8),
  metric_date        date not null default ((now() at time zone 'utc'))::date,
  synced_at          timestamptz not null default now(),
  raw_metadata       jsonb not null default '{}'::jsonb,
  -- FIX ISSUE 8: Idempotency key for cron retry deduplication
  sync_job_id        text,
  constraint facebook_post_analytics_post_day_unique unique (post_id, metric_date),
  constraint facebook_post_analytics_ext_nonempty check (
    length(trim(external_post_id)) > 0  -- FIX: removed redundant <> '' check
  )
);

comment on table public.facebook_post_analytics is
  'Daily per-post Facebook insights snapshots. RETENTION: rows older than 12 months should be archived or purged via scheduled job. PARTITIONING: partition by metric_date (monthly) once row count exceeds ~5M.';

-- FIX ISSUE 6: Index supports rate-limit and quota tracking queries
create index if not exists facebook_post_analytics_org_date_idx
  on public.facebook_post_analytics (organization_id, metric_date desc);

create index if not exists facebook_post_analytics_post_date_idx
  on public.facebook_post_analytics (post_id, metric_date desc);

-- FIX ISSUE 8: Index for idempotency key lookups
create index if not exists facebook_post_analytics_sync_job_idx
  on public.facebook_post_analytics (sync_job_id)
  where sync_job_id is not null;

alter table public.facebook_post_analytics enable row level security;

-- READ: org members only
create policy "facebook_post_analytics: org reads"
  on public.facebook_post_analytics for select
  to authenticated
  using ( public.is_org_member(organization_id) );

-- FIX ISSUE 2 & 3: Explicit write policies — service_role only for insert/update/delete
create policy "facebook_post_analytics: service insert"
  on public.facebook_post_analytics for insert
  to service_role
  with check (true);

create policy "facebook_post_analytics: service update"
  on public.facebook_post_analytics for update
  to service_role
  using (true)
  with check (true);

create policy "facebook_post_analytics: service delete"
  on public.facebook_post_analytics for delete
  to service_role
  using (true);


-- ── 2. facebook_page_analytics ─────────────────────────────────────────────
create table if not exists public.facebook_page_analytics (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  social_account_id    uuid not null references public.social_accounts(id) on delete cascade,
  impressions          bigint not null default 0,
  reach                bigint not null default 0,
  engagements          bigint not null default 0,
  clicks               bigint not null default 0,
  link_clicks          bigint not null default 0,
  video_views          bigint not null default 0,
  ctr                  numeric(14, 8),
  metric_date          date not null default ((now() at time zone 'utc'))::date,
  synced_at            timestamptz not null default now(),
  raw_metadata         jsonb not null default '{}'::jsonb,
  -- FIX ISSUE 8: Idempotency key
  sync_job_id          text,
  constraint facebook_page_analytics_page_day_unique unique (social_account_id, metric_date)
);

comment on table public.facebook_page_analytics is
  'Daily per-page Facebook insights snapshots. RETENTION: archive rows older than 12 months. PARTITIONING: consider monthly partitioning by metric_date at scale.';

create index if not exists facebook_page_analytics_org_date_idx
  on public.facebook_page_analytics (organization_id, metric_date desc);

alter table public.facebook_page_analytics enable row level security;

-- READ: org members only
create policy "facebook_page_analytics: org reads"
  on public.facebook_page_analytics for select
  to authenticated
  using ( public.is_org_member(organization_id) );

-- FIX ISSUE 2 & 3: Explicit write policies
create policy "facebook_page_analytics: service insert"
  on public.facebook_page_analytics for insert
  to service_role
  with check (true);

create policy "facebook_page_analytics: service update"
  on public.facebook_page_analytics for update
  to service_role
  using (true)
  with check (true);

create policy "facebook_page_analytics: service delete"
  on public.facebook_page_analytics for delete
  to service_role
  using (true);


-- ── 3. analytics_sync_logs ─────────────────────────────────────────────────
create table if not exists public.analytics_sync_logs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  -- FIX ISSUE 4 (platform): whitelist expanded for future platforms
  platform           text not null default 'facebook'
    check (platform in ('facebook', 'instagram', 'linkedin', 'twitter')),
  sync_kind          text not null default 'post_insights_daily',
  status             text not null check (status in ('running','completed','failed')),
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  posts_attempted    int not null default 0,
  posts_succeeded    int not null default 0,
  api_calls_approx   int not null default 0,
  error_summary      text,
  triggered_by       text not null default 'cron'
    check (triggered_by in ('cron','manual','worker')),
  -- FIX ISSUE 8: Idempotency key prevents duplicate cron execution
  sync_job_id        text unique,
  -- FIX ISSUE 6: API quota tracking columns
  rate_limit_remaining  int,
  rate_limit_reset_at   timestamptz,
  metadata           jsonb not null default '{}'::jsonb
);

comment on column public.analytics_sync_logs.sync_job_id is
  'Idempotency key (e.g. org_id + date + kind hash). Prevents duplicate cron executions on retry.';
comment on column public.analytics_sync_logs.rate_limit_remaining is
  'Meta API rate limit remaining at end of sync run. Null if not tracked.';
comment on column public.analytics_sync_logs.rate_limit_reset_at is
  'UTC timestamp when Meta API rate limit window resets.';
comment on column public.analytics_sync_logs.organization_id is
  'Nullable: org-scoped syncs set this. Global/system syncs may leave it null — readable only by admins.';

create index if not exists analytics_sync_logs_org_started_idx
  on public.analytics_sync_logs (organization_id, started_at desc);

-- FIX ISSUE 8: Fast idempotency key lookups
create index if not exists analytics_sync_logs_job_id_idx
  on public.analytics_sync_logs (sync_job_id)
  where sync_job_id is not null;

alter table public.analytics_sync_logs enable row level security;

-- READ: admin/super-admin see all; org members see their own org logs only
create policy "analytics_sync_logs: org reads"
  on public.analytics_sync_logs for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    or public.is_super_admin()
    or (
      organization_id is not null
      and public.is_org_member(organization_id)
    )
  );

-- FIX ISSUE 2 & 3: Write policies — service_role only
create policy "analytics_sync_logs: service insert"
  on public.analytics_sync_logs for insert
  to service_role
  with check (true);

create policy "analytics_sync_logs: service update"
  on public.analytics_sync_logs for update
  to service_role
  using (true)
  with check (true);


-- ── 4. activity_logs — scoped reads ─────────────────────────────────────────
-- BIGGEST SECURITY FIX: All EXISTS checks now verify org membership, not just existence.
-- PERFORMANCE FIX: is_org_member() is index-backed; raw EXISTS on posts was not.
drop policy if exists "activity_logs: select scoped" on public.activity_logs;

create policy "activity_logs: select scoped"
  on public.activity_logs for select
  to authenticated
  using (
    -- Admins and super-admins see everything
    public.current_user_role() = 'admin'
    or public.is_super_admin()

    -- FIX (SECURITY + PERF): post rows — verify org membership, not just existence
    or (
      entity_type = 'post'
      and entity_id is not null
      and exists (
        select 1 from public.posts p
        where p.id = entity_id
          and public.is_org_member(p.organization_id)  -- was missing; ownership confirmed
      )
    )

    or (
      entity_type = 'media'
      and entity_id is not null
      and (
        -- FIX: verify org membership via post relationship
        exists (
          select 1 from public.media m
          join public.posts p on p.id = m.post_id
          where m.id = entity_id
            and public.is_org_member(p.organization_id)
        )
        or (
          action_type = 'media.library_deleted'
          and coalesce(metadata->>'library_owner_id', '') <> ''
          and (metadata->>'library_owner_id')::uuid = auth.uid()
        )
      )
    )

    -- FIX: post_platform rows — verify org via post ownership
    or (
      entity_type = 'post_platform'
      and entity_id is not null
      and exists (
        select 1 from public.posts p
        where p.id = entity_id
          and public.is_org_member(p.organization_id)  -- was missing
      )
    )

    -- User rows — own record or admin (no change needed here)
    or (
      entity_type = 'user'
      and entity_id is not null
      and (
        entity_id = auth.uid()
        or public.current_user_role() = 'admin'
      )
    )

    -- Social account rows — verified via org membership join
    or (
      entity_type = 'social_account'
      and (
        user_id = auth.uid()
        or public.current_user_role() = 'admin'
        or (
          entity_id is not null
          and exists (
            select 1 from public.social_accounts_safe sa
            join public.organization_members om
              on om.organization_id = sa.organization_id
              and om.user_id = auth.uid()
            where sa.id = entity_id
          )
        )
      )
    )

    -- Analytics / integrations audit rows — org membership confirmed via entity_id
    or (
      entity_type = 'organization'
      and entity_id is not null
      and public.is_org_member(entity_id)
    )
  );


-- ── 5. Stuck-worker recovery helper ─────────────────────────────────────────
-- FIX ISSUE 7: Marks posts stuck in 'syncing' for >15 min back to 'stale'.
-- Run this from your cron job or a pg_cron schedule (e.g. every 5 minutes).
create or replace function public.recover_stale_syncing_posts()
returns void
language sql
security definer
as $$
  update public.posts
  set
    fb_analytics_sync_status       = 'stale',
    fb_analytics_syncing_started_at = null
  where
    fb_analytics_sync_status = 'syncing'
    and fb_analytics_syncing_started_at < now() - interval '15 minutes';
$$;

comment on function public.recover_stale_syncing_posts() is
  'Recovers posts stuck in syncing state due to worker crash. Schedule via pg_cron every 5 minutes.';