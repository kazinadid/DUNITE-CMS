-- ============================================================================
-- Dunite CMS — Production import execution engine primitives
-- ============================================================================
-- Adds chunk/attempt telemetry, worker lease RPCs, and retry-safe execution
-- helpers for dedicated asynchronous workers.
-- ============================================================================

-- ── 1. Extend status enum check with retrying ────────────────────────────────

alter table public.import_jobs drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
  add constraint import_jobs_status_check
  check (status in (
    'uploaded',
    'validating',
    'validated',
    'staging',
    'staged',
    'queued',
    'processing',
    'completed',
    'partial_success',
    'failed',
    'cancelled',
    'retrying'
  ));

-- ── 2. Chunk telemetry table ─────────────────────────────────────────────────

create table if not exists public.import_job_chunks (
  id            uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.import_jobs(id) on delete cascade,
  chunk_index    bigint not null,
  worker_id      text not null,
  queue_name     text not null default 'default',
  status         text not null default 'processing'
    check (status in ('claimed', 'processing', 'completed', 'failed', 'cancelled', 'retrying')),
  claimed_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,
  rows_claimed   int not null default 0 check (rows_claimed >= 0),
  rows_imported  int not null default 0 check (rows_imported >= 0),
  rows_failed    int not null default 0 check (rows_failed >= 0),
  retry_count    int not null default 0 check (retry_count >= 0),
  duration_ms    bigint,
  error_summary  text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (job_id, chunk_index)
);

comment on table public.import_job_chunks is
  'Execution chunk timeline for each import job, including worker attribution and failure isolation.';

create index if not exists import_job_chunks_job_idx
  on public.import_job_chunks (job_id, chunk_index desc);

create index if not exists import_job_chunks_worker_idx
  on public.import_job_chunks (worker_id, claimed_at desc);

create index if not exists import_job_chunks_status_idx
  on public.import_job_chunks (status, claimed_at desc);

-- ── 3. Row attempt telemetry table ───────────────────────────────────────────

create table if not exists public.import_row_attempts (
  id              uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.import_jobs(id) on delete cascade,
  row_id           uuid not null references public.import_rows(id) on delete cascade,
  chunk_id         uuid references public.import_job_chunks(id) on delete set null,
  worker_id        text not null,
  attempt_no       int not null check (attempt_no >= 1),
  status           text not null default 'processing'
    check (status in ('processing', 'imported', 'failed', 'skipped', 'cancelled')),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  error_message    text,
  error_details    jsonb,
  payload_snapshot jsonb,
  created_at       timestamptz not null default now()
);

comment on table public.import_row_attempts is
  'Per-row execution attempts for diagnostics, retries, and dead-letter style visibility.';

create index if not exists import_row_attempts_job_idx
  on public.import_row_attempts (job_id, created_at desc);

create index if not exists import_row_attempts_row_idx
  on public.import_row_attempts (row_id, attempt_no desc);

create index if not exists import_row_attempts_chunk_idx
  on public.import_row_attempts (chunk_id);

create index if not exists import_row_attempts_status_idx
  on public.import_row_attempts (status, created_at desc);

-- ── 4. RLS for new telemetry tables ──────────────────────────────────────────

alter table public.import_job_chunks enable row level security;
alter table public.import_row_attempts enable row level security;

drop policy if exists "import_job_chunks: scoped select" on public.import_job_chunks;
drop policy if exists "import_job_chunks: scoped write" on public.import_job_chunks;
drop policy if exists "import_row_attempts: scoped select" on public.import_row_attempts;
drop policy if exists "import_row_attempts: scoped write" on public.import_row_attempts;

create policy "import_job_chunks: scoped select"
  on public.import_job_chunks for select
  using (public.can_read_import_job(job_id));

create policy "import_job_chunks: scoped write"
  on public.import_job_chunks for all
  using (public.can_manage_import_job(job_id))
  with check (public.can_manage_import_job(job_id));

create policy "import_row_attempts: scoped select"
  on public.import_row_attempts for select
  using (public.can_read_import_job(job_id));

create policy "import_row_attempts: scoped write"
  on public.import_row_attempts for all
  using (public.can_manage_import_job(job_id))
  with check (public.can_manage_import_job(job_id));

-- ── 5. updated_at trigger for chunks ─────────────────────────────────────────

drop trigger if exists import_job_chunks_touch on public.import_job_chunks;
create trigger import_job_chunks_touch
  before update on public.import_job_chunks
  for each row execute function public.touch_updated_at();

-- ── 6. Worker lease + queue claim RPCs ───────────────────────────────────────

create or replace function public.import_job_worker_claim_next(
  p_worker_id text,
  p_queue_name text default 'default',
  p_stale_after interval default interval '25 minutes'
)
returns table (
  job_id uuid,
  status text,
  queue_name text,
  claimed_at timestamptz,
  job_retry_count int,
  max_job_retries int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.import_jobs%rowtype;
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'worker_id_required' using errcode = '22023';
  end if;

  update public.import_jobs j set
    status = 'retrying',
    queued_at = now(),
    worker_claim_id = null,
    error_summary = left(
      coalesce(j.error_summary, '')
      || case when coalesce(trim(j.error_summary), '') = '' then '' else ' ' end
      || 'Worker heartbeat expired; execution lease reclaimed.',
      2000
    ),
    execution_stats = coalesce(j.execution_stats, '{}'::jsonb)
      || jsonb_build_object(
        'stale_reclaim_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'stale_after_seconds', extract(epoch from p_stale_after)::bigint
      )
  where j.status = 'processing'
    and coalesce(j.processing_heartbeat_at, j.started_at, j.updated_at) < (now() - p_stale_after)
    and j.worker_claim_id is not null;

  select * into v_job
  from public.import_jobs j
  where j.status in ('queued', 'retrying')
  order by coalesce(j.queued_at, j.created_at) asc, j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.import_jobs j set
    status = 'processing',
    queue_name = coalesce(nullif(trim(p_queue_name), ''), j.queue_name, 'default'),
    worker_claim_id = p_worker_id,
    started_at = coalesce(j.started_at, now()),
    processing_heartbeat_at = now(),
    execution_stats = coalesce(j.execution_stats, '{}'::jsonb)
      || jsonb_build_object(
        'worker_id', p_worker_id,
        'worker_claimed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'queue_name', coalesce(nullif(trim(p_queue_name), ''), j.queue_name, 'default')
      )
  where j.id = v_job.id;

  return query
  select
    v_job.id,
    'processing'::text,
    coalesce(nullif(trim(p_queue_name), ''), v_job.queue_name, 'default'),
    now(),
    v_job.job_retry_count,
    v_job.max_job_retries;
end;
$$;

revoke all on function public.import_job_worker_claim_next(text, text, interval) from public;
grant execute on function public.import_job_worker_claim_next(text, text, interval)
  to authenticated, service_role;


create or replace function public.import_job_worker_heartbeat(
  p_job_id uuid,
  p_worker_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.import_jobs j set
    processing_heartbeat_at = now(),
    execution_stats = coalesce(j.execution_stats, '{}'::jsonb)
      || jsonb_build_object(
        'worker_id', p_worker_id,
        'last_heartbeat_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
      || coalesce(p_metadata, '{}'::jsonb)
  where j.id = p_job_id
    and j.status = 'processing'
    and j.worker_claim_id = p_worker_id;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.import_job_worker_heartbeat(uuid, text, jsonb) from public;
grant execute on function public.import_job_worker_heartbeat(uuid, text, jsonb)
  to authenticated, service_role;


create or replace function public.import_job_worker_release(
  p_job_id uuid,
  p_worker_id text,
  p_target_status text default 'queued',
  p_error_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_target_status not in (
    'queued',
    'retrying',
    'processing',
    'completed',
    'partial_success',
    'failed',
    'cancelled'
  ) then
    raise exception 'invalid_target_status' using errcode = '22023';
  end if;

  update public.import_jobs j set
    status = p_target_status,
    queued_at = case when p_target_status in ('queued', 'retrying') then now() else j.queued_at end,
    worker_claim_id = case when p_target_status = 'processing' then j.worker_claim_id else null end,
    processing_heartbeat_at = now(),
    error_summary = case
      when p_error_summary is null then j.error_summary
      else left(coalesce(p_error_summary, ''), 2000)
    end
  where j.id = p_job_id
    and (
      j.worker_claim_id = p_worker_id
      or p_worker_id = '__system__'
    );

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.import_job_worker_release(uuid, text, text, text) from public;
grant execute on function public.import_job_worker_release(uuid, text, text, text)
  to authenticated, service_role;

-- ── 7. Chunk claim / finalize RPCs ───────────────────────────────────────────

create or replace function public.import_job_chunk_start(
  p_job_id uuid,
  p_worker_id text,
  p_chunk_size int default 75
)
returns table (
  chunk_id uuid,
  rows_claimed int,
  from_row int,
  to_row int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed_ids uuid[];
  v_count int := 0;
  v_from int;
  v_to int;
  v_chunk_id uuid;
  v_chunk_index bigint;
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.import_jobs j
    where j.id = p_job_id
      and j.status = 'processing'
      and (j.worker_claim_id is null or j.worker_claim_id = p_worker_id)
  ) then
    return;
  end if;

  select
    coalesce(array_agg(r.id), array[]::uuid[]),
    coalesce(min(r.row_number), 0),
    coalesce(max(r.row_number), 0),
    count(*)
  into
    v_claimed_ids,
    v_from,
    v_to,
    v_count
  from public.import_rows_claim_execution_batch(p_job_id, p_chunk_size) r;

  if v_count = 0 then
    return;
  end if;

  select coalesce(max(c.chunk_index), 0) + 1
  into v_chunk_index
  from public.import_job_chunks c
  where c.job_id = p_job_id;

  insert into public.import_job_chunks (
    job_id,
    chunk_index,
    worker_id,
    queue_name,
    status,
    claimed_at,
    started_at,
    rows_claimed,
    metadata
  )
  values (
    p_job_id,
    v_chunk_index,
    p_worker_id,
    coalesce((select j.queue_name from public.import_jobs j where j.id = p_job_id), 'default'),
    'processing',
    now(),
    now(),
    v_count,
    jsonb_build_object(
      'claimed_row_ids', to_jsonb(v_claimed_ids),
      'chunk_size_requested', p_chunk_size
    )
  )
  returning id into v_chunk_id;

  return query select v_chunk_id, v_count, v_from, v_to;
end;
$$;

revoke all on function public.import_job_chunk_start(uuid, text, int) from public;
grant execute on function public.import_job_chunk_start(uuid, text, int)
  to authenticated, service_role;


create or replace function public.import_job_chunk_finish(
  p_chunk_id uuid,
  p_worker_id text,
  p_rows_imported int,
  p_rows_failed int,
  p_status text default 'completed',
  p_error_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_status not in ('completed', 'failed', 'cancelled', 'retrying') then
    raise exception 'invalid_chunk_status' using errcode = '22023';
  end if;

  update public.import_job_chunks c set
    status = p_status,
    completed_at = now(),
    rows_imported = greatest(0, coalesce(p_rows_imported, 0)),
    rows_failed = greatest(0, coalesce(p_rows_failed, 0)),
    duration_ms = greatest(
      0,
      (extract(epoch from (now() - coalesce(c.started_at, c.claimed_at))) * 1000)::bigint
    ),
    error_summary = case
      when p_error_summary is null then c.error_summary
      else left(p_error_summary, 2000)
    end
  where c.id = p_chunk_id
    and c.worker_id = p_worker_id;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.import_job_chunk_finish(uuid, text, int, int, text, text) from public;
grant execute on function public.import_job_chunk_finish(uuid, text, int, int, text, text)
  to authenticated, service_role;


create or replace function public.import_job_chunk_history(
  p_job_id uuid,
  p_limit int default 100,
  p_offset int default 0
)
returns setof public.import_job_chunks
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.import_job_chunks c
  where c.job_id = p_job_id
    and public.can_read_import_job(c.job_id)
  order by c.chunk_index desc, c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.import_job_chunk_history(uuid, int, int) from public;
grant execute on function public.import_job_chunk_history(uuid, int, int)
  to authenticated, service_role;
