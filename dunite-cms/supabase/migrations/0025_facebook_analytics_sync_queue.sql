-- ============================================================================
-- DUNITE CMS — Facebook analytics sync queue (serverless-safe claim pattern)
-- FIXED VERSION: updated_at, completed_at, error codes, priority, indexes,
--                trigger, security hardening, sync_started_at corrected.
-- Additive only. Writes via service_role / RPC security definer.
-- ============================================================================

create table if not exists public.facebook_analytics_sync_queue (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  job_kind            text not null default 'facebook_post_refresh'
    check (job_kind in ('facebook_post_refresh','facebook_page_refresh')),
  post_id             uuid references public.posts(id) on delete cascade,
  social_account_id   uuid references public.social_accounts(id) on delete cascade,
  status              text not null default 'pending'
    check (status in ('pending','processing','completed','failed','dead')),
  -- FIX 8: Priority for urgent/manual jobs (lower = higher priority)
  priority            int not null default 100,
  retry_count         int not null default 0,
  max_retries         int not null default 6,
  -- FIX 4: Reset each claim so retries get a fresh timestamp
  sync_started_at     timestamptz,
  -- FIX 5: Track when job finished for latency/observability
  completed_at        timestamptz,
  last_error          text,
  -- FIX 6: Structured error code for cleaner retry routing
  last_error_code     text
    check (last_error_code is null or last_error_code in (
      'RATE_LIMIT',
      'TOKEN_EXPIRED',
      'META_API_ERROR',
      'NETWORK_TIMEOUT',
      'UNKNOWN'
    )),
  next_attempt_after  timestamptz not null default now(),
  idempotency_key     text unique,
  runner_lock         text,
  locked_until        timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  -- FIX 1: Track full lifecycle for debugging
  updated_at          timestamptz not null default now(),
  constraint facebook_analytics_queue_post_ck check (
    job_kind <> 'facebook_post_refresh' or post_id is not null
  ),
  constraint facebook_analytics_queue_page_ck check (
    job_kind <> 'facebook_page_refresh' or social_account_id is not null
  )
);

comment on table public.facebook_analytics_sync_queue is
  'Serverless-safe Facebook analytics sync queue. RETENTION: purge completed/dead rows older than 30 days via pg_cron. PARTITIONING: consider by created_at if row count exceeds 1M.';
comment on column public.facebook_analytics_sync_queue.priority is
  'Job priority: lower value = claimed first. Default 100. Use lower values for manual/urgent refreshes.';
comment on column public.facebook_analytics_sync_queue.sync_started_at is
  'Reset to now() on every claim attempt. Use audit logs or metadata for historical retry timing.';
comment on column public.facebook_analytics_sync_queue.last_error_code is
  'Structured error code for retry routing (RATE_LIMIT, TOKEN_EXPIRED, META_API_ERROR, NETWORK_TIMEOUT, UNKNOWN).';
comment on column public.facebook_analytics_sync_queue.completed_at is
  'Set when status transitions to completed or dead. Used for latency tracking and observability.';


-- ── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists facebook_analytics_queue_org_status_idx
  on public.facebook_analytics_sync_queue (organization_id, status, next_attempt_after);

-- FIX 8: Priority-aware claim index
create index if not exists facebook_analytics_queue_claim_idx
  on public.facebook_analytics_sync_queue (priority asc, next_attempt_after asc)
  where status = 'pending';

-- FIX 3: Stale processing job recovery (locked_until < now())
create index if not exists facebook_analytics_queue_stale_idx
  on public.facebook_analytics_sync_queue (locked_until)
  where status = 'processing';


-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.facebook_analytics_sync_queue enable row level security;

create policy "facebook_analytics_queue: org read"
  on public.facebook_analytics_sync_queue for select
  to authenticated
  using ( public.is_org_member(organization_id) );

create policy "facebook_analytics_queue: service inserts"
  on public.facebook_analytics_sync_queue for insert
  to service_role
  with check (true);

create policy "facebook_analytics_queue: service update"
  on public.facebook_analytics_sync_queue for update
  to service_role
  using (true)
  with check (true);

create policy "facebook_analytics_queue: service delete"
  on public.facebook_analytics_sync_queue for delete
  to service_role
  using (true);


-- ── FIX 2: updated_at trigger ───────────────────────────────────────────────
-- Assumes public.handle_updated_at() already exists in the schema.
-- If not, create it:
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_facebook_analytics_queue_updated_at
  before update on public.facebook_analytics_sync_queue
  for each row
  execute function public.handle_updated_at();


-- ── Claim function ───────────────────────────────────────────────────────────
-- FIX 7: Added set row_security = off (security definer + service_role only;
--         RLS bypass is intentional and safe here).
-- FIX 4: sync_started_at = now() on every claim (not preserved across retries).
-- FIX 8: ORDER BY priority asc, created_at asc for priority-aware scheduling.
create or replace function public.claim_facebook_analytics_sync_jobs(
  p_batch_size    int     default 25,
  p_runner_id     text    default 'cron-worker',
  p_lock_seconds  int     default 120
)
returns setof public.facebook_analytics_sync_queue
language plpgsql
security definer
set search_path  = public
set row_security = off          -- FIX 7: explicit RLS bypass inside definer
as $$
begin
  if p_batch_size < 1 or p_batch_size > 200 then
    raise exception 'invalid batch_size: must be between 1 and 200';
  end if;

  return query
    with cand as (
      select q.id
      from public.facebook_analytics_sync_queue q
      where q.status = 'pending'
        and q.next_attempt_after <= now()
        and (q.locked_until is null or q.locked_until < now())
      -- FIX 8: priority-aware ordering
      order by q.priority asc, q.created_at asc
      limit p_batch_size
      for update skip locked
    ),
    updated as (
      update public.facebook_analytics_sync_queue q
      set
        status          = 'processing',
        runner_lock     = left(coalesce(p_runner_id, 'worker'), 128),
        locked_until    = now() + make_interval(
                            secs => greatest(30, least(900, coalesce(p_lock_seconds, 120)))
                          ),
        -- FIX 4: always reset to now() so retry timing is accurate
        sync_started_at = now(),
        updated_at      = now()
      where q.id in (select cand.id from cand)
      returning q.*
    )
  select * from updated;
end;
$$;

revoke all    on function public.claim_facebook_analytics_sync_jobs(int, text, int) from public;
grant  execute on function public.claim_facebook_analytics_sync_jobs(int, text, int) to service_role;


-- ── FIX 3 + 9: Stale job recovery + retention cleanup helper ────────────────
-- Schedule both via pg_cron (e.g. recovery every 5 min, cleanup daily).
create or replace function public.recover_stale_facebook_queue_jobs()
returns void
language sql
security definer
set search_path  = public
set row_security = off
as $$
  -- Re-queue processing jobs whose lock expired (crashed workers)
  update public.facebook_analytics_sync_queue
  set
    status              = 'pending',
    runner_lock         = null,
    locked_until        = null,
    sync_started_at     = null,
    next_attempt_after  = now(),
    updated_at          = now()
  where
    status       = 'processing'
    and locked_until < now();
$$;

create or replace function public.purge_old_facebook_queue_jobs(
  p_retain_days int default 30
)
returns int                       -- rows deleted
language plpgsql
security definer
set search_path  = public
set row_security = off
as $$
declare
  v_deleted int;
begin
  -- FIX 9: Retention — remove terminal jobs older than retention window
  delete from public.facebook_analytics_sync_queue
  where status in ('completed', 'dead')
    and created_at < now() - make_interval(days => greatest(1, p_retain_days));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.recover_stale_facebook_queue_jobs() is
  'Re-queues processing rows whose lock expired. Schedule via pg_cron every 5 minutes.';
comment on function public.purge_old_facebook_queue_jobs(int) is
  'Deletes completed/dead queue rows older than p_retain_days (default 30). Schedule daily via pg_cron.';

revoke all    on function public.recover_stale_facebook_queue_jobs()    from public;
revoke all    on function public.purge_old_facebook_queue_jobs(int)     from public;
grant  execute on function public.recover_stale_facebook_queue_jobs()   to service_role;
grant  execute on function public.purge_old_facebook_queue_jobs(int)    to service_role;