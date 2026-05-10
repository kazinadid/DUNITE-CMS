-- ============================================================================
-- Dunite CMS — Batch post import foundation (enterprise bulk upload pipeline)
-- ============================================================================
--
-- Adds `import_jobs` + `import_rows` with RBAC-aligned RLS, statistics helpers,
-- duplicate detection primitives, activity log integration, and notification hooks.
--
-- Designed for eventual worker/queue tiers (SKIP LOCKED, service_role workers,
-- etc.) without disrupting Composer, publishing, notifications, or media RLS.
--
-- Typical status flow:
--   uploaded → processing → validated → processing → completed
--                                       ↘ failed / cancelled
-- ============================================================================


-- ── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists public.import_jobs (
  id               uuid primary key default gen_random_uuid(),
  uploaded_by      uuid not null references public.users(id) on delete cascade,
  file_name        text not null,
  file_type        text,
  upload_source    text not null default 'dashboard',
  status           text not null default 'uploaded'
    check (status in (
      'uploaded',
      'processing',
      'validated',
      'failed',
      'completed',
      'cancelled'
    )),
  total_rows       int not null default 0,
  valid_rows       int not null default 0,
  invalid_rows     int not null default 0,
  duplicate_rows   int not null default 0,
  warning_rows     int not null default 0,
  imported_rows    int not null default 0,
  error_summary    text,
  metadata         jsonb not null default '{}'::jsonb,
  queue_name       text,
  worker_claim_id  uuid,
  started_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,

  constraint import_jobs_source_len check (length(upload_source) <= 120),
  constraint import_jobs_fname_len check (length(file_name) <= 520),
  constraint import_jobs_file_type_len check (file_type is null or length(file_type) <= 200),
  constraint import_jobs_counts_nonneg check (
    total_rows >= 0
    and valid_rows >= 0
    and invalid_rows >= 0
    and duplicate_rows >= 0
    and warning_rows >= 0
    and imported_rows >= 0
  )
);

comment on table public.import_jobs is
  'Bulk-import job descriptors; lifecycle + aggregate counters mirrored from import_rows.';
comment on column public.import_jobs.error_summary is
  'Human-readable rollup of validation failures or fatal worker stops.';
comment on column public.import_jobs.queue_name is
  'Logical queue/channel for worker routing (unset until infra uses it).';
comment on column public.import_jobs.worker_claim_id is
  'Opaque lease id from orchestrator SKIP LOCKED claimers; nullable.';


create table if not exists public.import_rows (
  id                 uuid primary key default gen_random_uuid(),
  import_job_id      uuid not null references public.import_jobs(id) on delete cascade,
  row_number         int not null,

  parsed_data        jsonb not null default '{}'::jsonb,
  validation_errors  jsonb not null default '[]'::jsonb,
  warnings           jsonb not null default '[]'::jsonb,
  duplicate_flags    jsonb not null default '{}'::jsonb,

  processing_state   text not null default 'valid'
    check (processing_state in (
      'valid',
      'invalid',
      'warning',
      'duplicate',
      'imported',
      'failed'
    )),

  post_id           uuid references public.posts(id) on delete set null,
  error_message     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (import_job_id, row_number)
);

comment on table public.import_rows is
  'Per-record parsed payload belonging to exactly one import_jobs row.';


-- ── 2. Indexes ───────────────────────────────────────────────────────────────

create index if not exists import_jobs_owner_created_idx
  on public.import_jobs (uploaded_by, created_at desc);

create index if not exists import_jobs_status_created_idx
  on public.import_jobs (status, created_at);

create index if not exists import_jobs_active_queue_hint_idx
  on public.import_jobs (status, created_at)
  where status in ('uploaded', 'validated', 'processing');

create index if not exists import_rows_job_idx
  on public.import_rows (import_job_id);

create index if not exists import_rows_job_state_rownum_idx
  on public.import_rows (import_job_id, processing_state, row_number);

create index if not exists import_rows_job_rownum_idx
  on public.import_rows (import_job_id, row_number);

create index if not exists import_rows_post_idx
  on public.import_rows (post_id)
  where post_id is not null;

create index if not exists import_rows_parsed_gin_idx
  on public.import_rows using gin (parsed_data jsonb_path_ops);


-- ── 3. Touch triggers ───────────────────────────────────────────────────────

drop trigger if exists import_jobs_touch on public.import_jobs;
create trigger import_jobs_touch
  before update on public.import_jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists import_rows_touch on public.import_rows;
create trigger import_rows_touch
  before update on public.import_rows
  for each row execute function public.touch_updated_at();


-- ── 4. Lifecycle timestamps (terminal + first processing heartbeat) ────────

create or replace function public.import_jobs_stamp_lifecycle_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if NEW.started_at is null
    and OLD.status is distinct from NEW.status
    and NEW.status = 'processing' then
    NEW.started_at := now();
  end if;

  if NEW.completed_at is null
    and OLD.status is distinct from NEW.status
    and NEW.status in ('completed', 'failed', 'cancelled') then
    NEW.completed_at := now();
  end if;

  return NEW;
end;
$$;

drop trigger if exists import_jobs_lifecycle before update on public.import_jobs;
create trigger import_jobs_lifecycle
  before update on public.import_jobs
  for each row execute function public.import_jobs_stamp_lifecycle_before_update();


-- ── 5. RBAC helpers ───────────────────────────────────────────────────────────

create or replace function public.can_manage_import_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.import_jobs j
    where j.id = p_job_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() = 'editor'
          and j.uploaded_by = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_manage_import_job(uuid) from public;
grant execute on function public.can_manage_import_job(uuid) to authenticated;


create or replace function public.can_read_import_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.import_jobs j
    where j.id = p_job_id
      and (
        public.current_user_role() = 'admin'
        or (
          public.current_user_role() = 'editor'
          and j.uploaded_by = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_read_import_job(uuid) from public;
grant execute on function public.can_read_import_job(uuid) to authenticated;


-- ── 6. Validation / fingerprint helpers ───────────────────────────────────────

create or replace function public.import_row_coerce_jsonb_shallow(p_data jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  k   text;
  v   jsonb;
  out jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(coalesce(p_data, 'null'::jsonb)) <> 'object' then
    return '{}'::jsonb;
  end if;

  for k, v in select * from jsonb_each(p_data) loop
    if jsonb_typeof(v) = 'string' then
      out := out || jsonb_build_object(k, trim(both from v #>> '{}'));
    else
      out := out || jsonb_build_object(k, v);
    end if;
  end loop;

  return coalesce(out, '{}'::jsonb);
end;
$$;


create or replace function public.import_required_jsonb_keys_validate(
  p_data jsonb,
  p_required_keys text[]
)
returns jsonb
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(jsonb_agg(err order by idx), '[]'::jsonb)
  from (
    select
      rk.ordinal as idx,
      case
        when rk.key is null or length(trim(both rk.key)) = 0 then
          to_jsonb('required_key_blank'::text)
        when not jsonb_exists(p_data, rk.key)
          or (p_data->rk.key) is null
          or jsonb_typeof(p_data->rk.key) = 'null'
          or (
            jsonb_typeof(p_data->rk.key) = 'string'
            and trim(both from coalesce((p_data->>rk.key), '')) = ''
          ) then
          to_jsonb(format('missing_or_empty_%s', replace(rk.key, '%', '_')))
        else null
      end as err
    from unnest(coalesce(p_required_keys, ARRAY[]::text[]))
      with ordinality as rk(key, ordinal)
  ) s
  where err is not null;
$$;


create or replace function public.import_row_content_for_match(p_row jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select left(
    trim(
      both from coalesce(
        nullif(trim(both from p_row ->> 'content'), ''),
        nullif(trim(both from p_row ->> 'body'), ''),
        ''
      )
    ),
    20000
  );
$$;


create or replace function public.import_row_fingerprint_normalized(p_row jsonb)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select md5(
    trim(
      both from coalesce(
        nullif(trim(both from p_row ->> 'external_id'), ''),
        nullif(trim(both from p_row ->> 'import_key'), ''),
        nullif(trim(both from p_row ->> 'slug'), ''),
        nullif(trim(both from p_row ->> 'title'), ''),
        left(public.import_row_content_for_match(p_row), 8000),
        '__empty__'::text
      )
    )
  );
$$;


-- ── 7. Statistics recomputation ───────────────────────────────────────────────

create or replace function public.import_jobs_recompute_row_statistics(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.import_jobs j
  set
    total_rows     = agg.c_total,
    valid_rows     = agg.c_valid,
    invalid_rows   = agg.c_invalid,
    warning_rows   = agg.c_warn,
    duplicate_rows = agg.c_dup,
    imported_rows  = agg.c_imp
  from (
    select
      r.import_job_id,
      count(*)                                             as c_total,
      count(*) filter (where r.processing_state = 'valid')   as c_valid,
      count(*) filter (where r.processing_state = 'invalid') as c_invalid,
      count(*) filter (where r.processing_state = 'warning') as c_warn,
      count(*) filter (where r.processing_state = 'duplicate') as c_dup,
      count(*) filter (where r.processing_state = 'imported') as c_imp
    from public.import_rows r
    where r.import_job_id = p_job_id
    group by r.import_job_id
  ) agg
  where j.id = agg.import_job_id
    and j.id = p_job_id;

  update public.import_jobs j
  set
    total_rows     = 0,
    valid_rows     = 0,
    invalid_rows   = 0,
    warning_rows   = 0,
    duplicate_rows = 0,
    imported_rows  = 0
  where j.id = p_job_id
    and not exists (select 1 from public.import_rows r where r.import_job_id = j.id);

end;
$$;

revoke all on function public.import_jobs_recompute_row_statistics(uuid) from public;
grant execute on function public.import_jobs_recompute_row_statistics(uuid)
  to authenticated, service_role;


-- ── 8. Duplicate helpers (SECURITY DEFINER job-scoped mutations) ────────────

create or replace function public.import_job_mark_duplicates_within_job(
  p_job_id uuid,
  p_from_states text[] default array['valid', 'warning']::text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with ranked as (
    select
      r.id,
      row_number() over (
        partition by public.import_row_fingerprint_normalized(r.parsed_data), r.import_job_id
        order by r.row_number asc, r.id asc
      ) as rk
    from public.import_rows r
    where r.import_job_id = p_job_id
      and r.processing_state = any (coalesce(p_from_states, array['valid', 'warning']::text[]))
  ),
  losers as (
    select id from ranked where rk > 1
  )
  update public.import_rows r set
    processing_state = 'duplicate',
    duplicate_flags = jsonb_strip_nulls(
      jsonb_build_object(
        'within_job', true,
        'fingerprint',
        left(public.import_row_fingerprint_normalized(r.parsed_data), 64),
        'rule', 'fingerprint_collision'
      )
    )
    || coalesce(r.duplicate_flags, '{}'::jsonb)
  from losers
  where r.id = losers.id;

  get diagnostics n = row_count;
  perform public.import_jobs_recompute_row_statistics(p_job_id);
  return n;
end;
$$;

revoke all on function public.import_job_mark_duplicates_within_job(uuid, text[]) from public;
grant execute on function public.import_job_mark_duplicates_within_job(uuid, text[])
  to authenticated, service_role;


create or replace function public.import_job_mark_duplicates_existing_posts(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  v_owner uuid;
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select j.uploaded_by into v_owner from public.import_jobs j where j.id = p_job_id;

  update public.import_rows r set
    processing_state = 'duplicate',
    duplicate_flags =
      jsonb_strip_nulls(
        jsonb_build_object(
          'against_existing_post', true,
          'matched_post_digest',
          left(md5(lower(trim(public.import_row_content_for_match(r.parsed_data)))), 16)
        )
      )
      || coalesce(r.duplicate_flags, '{}'::jsonb)
  where r.import_job_id = p_job_id
    and r.processing_state = any (array['valid', 'warning']::text[])
    and length(trim(public.import_row_content_for_match(r.parsed_data))) > 15
    and exists (
      select 1 from public.posts p
      where p.user_id = v_owner
        and lower(trim(p.content)) = lower(trim(public.import_row_content_for_match(r.parsed_data)))
      limit 1
    );

  get diagnostics n = row_count;
  perform public.import_jobs_recompute_row_statistics(p_job_id);
  return n;
end;
$$;

revoke all on function public.import_job_mark_duplicates_existing_posts(uuid) from public;
grant execute on function public.import_job_mark_duplicates_existing_posts(uuid)
  to authenticated, service_role;


-- ── 9. Activity + notifications ──────────────────────────────────────────────

create or replace function public.import_jobs_after_insert_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    coalesce(auth.uid(), NEW.uploaded_by),
    'import_job',
    NEW.id,
    'import.created',
    format('Bulk import queued (%s).', left(trim(NEW.file_name), 200)),
    jsonb_strip_nulls(jsonb_build_object(
      'import_job_id', NEW.id::text,
      'file_name', left(NEW.file_name, 520),
      'file_type', left(coalesce(NEW.file_type, ''), 240),
      'upload_source', left(NEW.upload_source, 120),
      'uploaded_by', NEW.uploaded_by::text,
      'status', NEW.status
    ))
  );
  return NEW;
end;
$$;

drop trigger if exists import_jobs_activity_ai on public.import_jobs;
create trigger import_jobs_activity_ai
  after insert on public.import_jobs
  for each row execute function public.import_jobs_after_insert_activity();


create or replace function public.import_jobs_after_update_activity_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act_uid uuid := coalesce(auth.uid(), NEW.uploaded_by);
  do_activity_completed boolean :=
    OLD.status is distinct from NEW.status and NEW.status = 'completed';
begin
  if OLD.status is distinct from NEW.status and NEW.status = 'validated' then
    if NEW.invalid_rows > 0 then
      perform public.notification_enqueue(
        NEW.uploaded_by,
        'import_validation_issues',
        'Import validation flagged rows',
        format(
          'Import «%s» validated with %s invalid row(s); review errors before committing.',
          left(trim(NEW.file_name), 120),
          NEW.invalid_rows
        ),
        jsonb_strip_nulls(jsonb_build_object(
          'import_job_id', NEW.id::text,
          'invalid_rows', NEW.invalid_rows,
          'duplicate_rows', NEW.duplicate_rows,
          'source', 'import_jobs'
        ))
      );
    end if;

    if NEW.duplicate_rows > 0 then
      perform public.notification_enqueue(
        NEW.uploaded_by,
        'import_duplicate_warnings',
        'Duplicates detected',
        format(
          'Import «%s» has %s possible duplicate row(s) (within file or CMS).',
          left(trim(NEW.file_name), 120),
          NEW.duplicate_rows
        ),
        jsonb_strip_nulls(jsonb_build_object(
          'import_job_id', NEW.id::text,
          'duplicate_rows', NEW.duplicate_rows,
          'source', 'import_jobs'
        ))
      );
    end if;

    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.validated',
      format('Validated import (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'invalid_rows', NEW.invalid_rows,
        'duplicate_rows', NEW.duplicate_rows,
        'valid_rows', NEW.valid_rows,
        'total_rows', NEW.total_rows,
        'status', NEW.status
      ))
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.status = 'cancelled' then
    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.cancelled',
      format('Import cancelled (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'previous_status', OLD.status,
        'uploaded_by', NEW.uploaded_by::text,
        'source', 'import_jobs'
      ))
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.status = 'failed' then
    perform public.notification_enqueue(
      NEW.uploaded_by,
      'import_failed',
      'Bulk import failed',
      coalesce(
        nullif(trim(NEW.error_summary), ''),
        format(
          'Import «%s» failed before completion.',
          left(trim(NEW.file_name), 120)
        )
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );

    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.failed',
      format('Import failed (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'error_summary', NEW.error_summary,
        'previous_status', OLD.status,
        'status', NEW.status
      ))
    );
  end if;

  if do_activity_completed then
    perform public.notification_enqueue(
      NEW.uploaded_by,
      'import_completed',
      'Bulk import completed',
      format(
        '%s/%s rows imported (%s)',
        NEW.imported_rows,
        NEW.total_rows,
        left(trim(NEW.file_name), 120)
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'imported_rows', NEW.imported_rows,
        'invalid_rows', NEW.invalid_rows,
        'duplicate_rows', NEW.duplicate_rows,
        'source', 'import_jobs'
      ))
    );

    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.completed',
      format('Import completed (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'imported_rows', NEW.imported_rows,
        'duplicate_rows', NEW.duplicate_rows,
        'invalid_rows', NEW.invalid_rows,
        'total_rows', NEW.total_rows,
        'duration_ms',
        (extract(epoch from (NEW.completed_at - NEW.created_at)) * 1000)::bigint
      ))
    );
  elseif NEW.imported_rows is distinct from OLD.imported_rows
    and NEW.imported_rows > coalesce(OLD.imported_rows, 0)
    and coalesce(
      NEW.imported_rows - coalesce(OLD.imported_rows, 0),
      0
    ) >= 500 then

    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.rows_imported',
      format(
        'Imported %s additional row(s)',
        NEW.imported_rows - coalesce(OLD.imported_rows, 0)
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'running_imported_total', NEW.imported_rows,
        'delta_since_last_emit',
        NEW.imported_rows - coalesce(OLD.imported_rows, 0),
        'status', NEW.status
      ))
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists import_jobs_activity_notify_au on public.import_jobs;
create trigger import_jobs_activity_notify_au
  after update on public.import_jobs
  for each row execute function public.import_jobs_after_update_activity_notify();


-- ── 10. RPC: deterministic job enqueue (editors constrained to themselves) ─

create or replace function public.import_job_enqueue_create(
  p_file_name     text,
  p_file_type     text default null,
  p_upload_source text default 'dashboard',
  p_uploaded_for  uuid default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid         uuid := gen_random_uuid();
  actor       uuid := auth.uid();
  target_user uuid := actor;
  meta jsonb :=
    case
      when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb)
      else '{}'::jsonb
    end;
begin
  if actor is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if public.current_user_role() = 'viewer' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if public.current_user_role() = 'editor' then
    if p_uploaded_for is not null and p_uploaded_for <> actor then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    target_user := actor;
  elsif public.current_user_role() = 'admin' then
    target_user := coalesce(p_uploaded_for, actor);
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.import_jobs (
    id,
    uploaded_by,
    file_name,
    file_type,
    upload_source,
    metadata
  )
  values (
    rid,
    target_user,
    left(trim(coalesce(p_file_name, '')), 520),
    case when length(trim(coalesce(p_file_type, ''))) = 0 then null else left(trim(p_file_type), 200) end,
    left(trim(coalesce(p_upload_source, 'dashboard')), 120),
    meta
  );

  return rid;
end;
$$;

revoke all on function public.import_job_enqueue_create(text, text, text, uuid, jsonb)
  from public;
grant execute on function public.import_job_enqueue_create(text, text, text, uuid, jsonb)
  to authenticated;


create or replace function public.import_jobs_emit_rows_import_activity(
  p_job_id uuid,
  p_imported_increment int default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  log_id uuid;
  act_uid uuid := coalesce(auth.uid(), (select j.uploaded_by from public.import_jobs j where j.id = p_job_id));
  msg text;
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  msg := trim(coalesce(
    nullif(p_message, ''),
    case
      when p_imported_increment is not null then
        format(
          '%s rows imported (manual checkpoint)',
          greatest(p_imported_increment, 0)
        )
      else 'Import progress checkpoint'
    end,
    ''
  ));

  select public.activity_logs_insert_safe(
    act_uid,
    'import_job',
    p_job_id,
    'import.rows_imported',
    msg,
    jsonb_strip_nulls(jsonb_build_object(
      'import_job_id', p_job_id::text,
      'checkpoint_imported_increment', p_imported_increment,
      'source', 'manual_emit'
    ))
  ) into log_id;

  return log_id;
end;
$$;

revoke all on function public.import_jobs_emit_rows_import_activity(uuid, int, text) from public;
grant execute on function public.import_jobs_emit_rows_import_activity(uuid, int, text)
  to authenticated, service_role;


-- ── 11. RLS ─────────────────────────────────────────────────────────────────

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "import_jobs: editors+admins insert" on public.import_jobs;
drop policy if exists "import_jobs: editor/admin select" on public.import_jobs;
drop policy if exists "import_jobs: editor/admin update" on public.import_jobs;
drop policy if exists "import_jobs: editor/admin delete" on public.import_jobs;

create policy "import_jobs: editor/admin select"
  on public.import_jobs for select
  to authenticated
  using (public.can_read_import_job(id));

create policy "import_jobs: editors+admins insert"
  on public.import_jobs for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'editor')
    and uploaded_by is not null
    and (
      public.current_user_role() = 'admin'
      or (public.current_user_role() = 'editor' and uploaded_by = auth.uid())
    )
  );

create policy "import_jobs: editor/admin update"
  on public.import_jobs for update
  to authenticated
  using (public.can_manage_import_job(id))
  with check (public.can_manage_import_job(id));

create policy "import_jobs: editor/admin delete"
  on public.import_jobs for delete
  to authenticated
  using (public.can_manage_import_job(id));


drop policy if exists "import_rows: job-scoped select" on public.import_rows;
drop policy if exists "import_rows: job-scoped writer insert" on public.import_rows;
drop policy if exists "import_rows: job-scoped writer update" on public.import_rows;
drop policy if exists "import_rows: job-scoped writer delete" on public.import_rows;

create policy "import_rows: job-scoped select"
  on public.import_rows for select
  to authenticated
  using (exists (
    select 1 from public.import_jobs j where j.id = import_job_id and public.can_read_import_job(j.id)
  ));

create policy "import_rows: job-scoped writer insert"
  on public.import_rows for insert
  to authenticated
  with check (
    exists (
      select 1 from public.import_jobs j where j.id = import_job_id and public.can_manage_import_job(j.id)
    )
    and row_number >= 1
  );

create policy "import_rows: job-scoped writer update"
  on public.import_rows for update
  to authenticated
  using (
    exists (
      select 1 from public.import_jobs j where j.id = import_job_id and public.can_manage_import_job(j.id)
    )
  )
  with check (
    exists (
      select 1 from public.import_jobs j where j.id = import_job_id and public.can_manage_import_job(j.id)
    )
  );

create policy "import_rows: job-scoped writer delete"
  on public.import_rows for delete
  to authenticated
  using (
    exists (
      select 1 from public.import_jobs j where j.id = import_job_id and public.can_manage_import_job(j.id)
    )
  );


-- ── 12. Activity log SELECT scope ───────────────────────────────────────────

drop policy if exists "activity_logs: select scoped" on public.activity_logs;

create policy "activity_logs: select scoped"
  on public.activity_logs for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
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
      entity_type = 'import_job'
      and entity_id is not null
      and exists (
        select 1 from public.import_jobs j
        where j.id = entity_id
          and public.can_read_import_job(j.id)
      )
    )
  );
