-- ============================================================================
-- Dunite CMS — Import processing queue + worker-safe claims + observability
-- ============================================================================
-- Adds `queued` lifecycle, transient `importing` row state (SKIP LOCKED claims),
-- heartbeat + retry counters, viewer read on import_jobs, and RPC helpers for
-- chunked execution without double-creating posts.
-- ============================================================================

-- ── 1. import_jobs: queue + execution observability columns ─────────────────

alter table public.import_jobs
  add column if not exists queued_at timestamptz,
  add column if not exists processing_heartbeat_at timestamptz,
  add column if not exists job_retry_count int not null default 0,
  add column if not exists max_job_retries int not null default 12;

comment on column public.import_jobs.queued_at is
  'When the job entered the logical processing queue (before first worker chunk).';
comment on column public.import_jobs.processing_heartbeat_at is
  'Last time a worker touched this job during execution; used for stale detection.';
comment on column public.import_jobs.job_retry_count is
  'How many times execution was re-queued after a terminal or retry flow.';
comment on column public.import_jobs.max_job_retries is
  'Upper bound for operator-driven re-queue / retry cycles (app-enforced).';

alter table public.import_jobs drop constraint if exists import_jobs_job_retry_count_nonneg;
alter table public.import_jobs drop constraint if exists import_jobs_max_job_retries_pos;

alter table public.import_jobs
  add constraint import_jobs_job_retry_count_nonneg check (job_retry_count >= 0),
  add constraint import_jobs_max_job_retries_pos check (max_job_retries > 0);

-- ── 2. import_rows: worker claim + row-level retry metadata ────────────────

alter table public.import_rows
  add column if not exists row_execution_retry_count int not null default 0,
  add column if not exists last_execution_attempt_at timestamptz;

comment on column public.import_rows.row_execution_retry_count is
  'Increments when a row fails during execution (bounded retry UX).';
comment on column public.import_rows.last_execution_attempt_at is
  'Last time this row entered the importing / execution path.';

alter table public.import_rows drop constraint if exists import_rows_processing_state_check;

alter table public.import_rows
  add constraint import_rows_processing_state_check
  check (processing_state in (
    'valid',
    'invalid',
    'warning',
    'duplicate',
    'imported',
    'failed',
    'importing'
  ));

alter table public.import_rows drop constraint if exists import_rows_row_execution_retry_count_nonneg;

alter table public.import_rows
  add constraint import_rows_row_execution_retry_count_nonneg
  check (row_execution_retry_count >= 0);

-- ── 3. Status enum: add `queued` ────────────────────────────────────────────

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
    'cancelled'
  ));

-- ── 4. Viewer read scope (import history dashboard, polling) ──────────────────

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
        or public.current_user_role() = 'viewer'
        or (
          public.current_user_role() = 'editor'
          and j.uploaded_by = auth.uid()
        )
      )
  );
$$;


-- ── 5. Heartbeat stamp when entering / staying in processing (optional hook) ─

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
    and NEW.status in ('completed', 'partial_success', 'failed', 'cancelled') then
    NEW.completed_at := now();
  end if;

  if OLD.status is distinct from NEW.status
    and NEW.status = 'processing' then
    NEW.processing_heartbeat_at := now();
  end if;

  return NEW;
end;
$$;


-- ── 6. Queue worker RPCs (SECURITY DEFINER, RBAC inside) ─────────────────────

create or replace function public.import_job_queue_position(p_job_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from public.import_jobs j where j.id = p_job_id and j.status = 'queued') then null::int
    else (
      select (count(*) + 1)::int
      from public.import_jobs j
      where j.status = 'queued'
        and j.created_at < (select jj.created_at from public.import_jobs jj where jj.id = p_job_id)
    )
  end;
$$;

revoke all on function public.import_job_queue_position(uuid) from public;
grant execute on function public.import_job_queue_position(uuid) to authenticated, service_role;


create or replace function public.import_rows_recover_stale_claims(
  p_job_id uuid,
  p_max_age interval default interval '25 minutes'
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

  update public.import_rows r set
    processing_state = 'valid',
    error_message = left(
      coalesce(r.error_message, '')
      || case when coalesce(trim(r.error_message), '') = '' then '' else '; ' end
      || 'Stale execution claim released for retry.',
      2000
    ),
    last_execution_attempt_at = now()
  where r.import_job_id = p_job_id
    and r.processing_state = 'importing'
    and coalesce(r.last_execution_attempt_at, r.created_at) < (now() - p_max_age);

  get diagnostics n = row_count;
  if n > 0 then
    perform public.import_jobs_recompute_row_statistics(p_job_id);
  end if;
  return n;
end;
$$;

revoke all on function public.import_rows_recover_stale_claims(uuid, interval) from public;
grant execute on function public.import_rows_recover_stale_claims(uuid, interval)
  to authenticated, service_role;


create or replace function public.import_rows_claim_execution_batch(
  p_job_id uuid,
  p_limit int default 40
)
returns setof public.import_rows
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 40), 500));
begin
  if auth.uid() is not null and not public.can_manage_import_job(p_job_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.import_jobs j
    where j.id = p_job_id and j.status = 'processing'
  ) then
    return;
  end if;

  return query
  with picked as (
    select r.id
    from public.import_rows r
    where r.import_job_id = p_job_id
      and r.post_id is null
      and r.processing_state in ('valid', 'warning')
    order by r.row_number asc, r.id asc
    limit lim
    for update skip locked
  )
  update public.import_rows r set
    processing_state = 'importing',
    last_execution_attempt_at = now()
  from picked
  where r.id = picked.id
  returning r.*;
end;
$$;

revoke all on function public.import_rows_claim_execution_batch(uuid, int) from public;
grant execute on function public.import_rows_claim_execution_batch(uuid, int)
  to authenticated, service_role;


-- ── 7. Stale processing jobs → re-queued (admin-only via app or future cron) ─

create or replace function public.import_jobs_requeue_stale_processing(
  p_heartbeat_age interval default interval '30 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  jid uuid;
  n int := 0;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with s as (
    select j.id
    from public.import_jobs j
    where j.status = 'processing'
      and coalesce(j.processing_heartbeat_at, j.started_at, j.updated_at) < (now() - p_heartbeat_age)
    for update skip locked
  ),
  u as (
    update public.import_jobs j set
      status = 'queued',
      queued_at = coalesce(j.queued_at, now()),
      error_summary = left(
        coalesce(j.error_summary, '')
        || case when coalesce(trim(j.error_summary), '') = '' then '' else ' ' end
        || 'Processing lease expired; job returned to queue.',
        2000
      ),
      execution_stats = coalesce(j.execution_stats, '{}'::jsonb)
        || jsonb_build_object(
          'stale_requeue_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'stale_heartbeat_age_seconds', extract(epoch from p_heartbeat_age)::bigint
        )
    from s
    where j.id = s.id
    returning j.id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into ids from u;

  if ids is not null and cardinality(ids) > 0 then
    update public.import_rows r set
      processing_state = 'valid',
      error_message = left(
        coalesce(r.error_message, '')
        || case when coalesce(trim(r.error_message), '') = '' then '' else '; ' end
        || 'Worker lease expired; row released for re-execution.',
        2000
      )
    where r.import_job_id = any (ids)
      and r.processing_state = 'importing';

    n := cardinality(ids);
    foreach jid in array ids loop
      perform public.import_jobs_recompute_row_statistics(jid);
    end loop;
  end if;

  return n;
end;
$$;

revoke all on function public.import_jobs_requeue_stale_processing(interval) from public;
grant execute on function public.import_jobs_requeue_stale_processing(interval)
  to authenticated, service_role;


-- ── 8. Activity + notifications: queued + recovery ──────────────────────────

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
  do_activity_partial boolean :=
    OLD.status is distinct from NEW.status and NEW.status = 'partial_success';
  qpos int;
begin
  if OLD.status is distinct from NEW.status and NEW.status = 'staging' then
    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.staging',
      format('Staging import (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.status = 'staged' then
    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.staged',
      format('Import staged (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'total_rows', NEW.total_rows,
        'valid_rows', NEW.valid_rows,
        'invalid_rows', NEW.invalid_rows,
        'duplicate_rows', NEW.duplicate_rows,
        'source', 'import_jobs'
      ))
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.status = 'queued' then
    qpos := public.import_job_queue_position(NEW.id);
    perform public.notification_enqueue(
      NEW.uploaded_by,
      'import_queued',
      'Import queued for processing',
      format(
        'Import «%s» is queued%s.',
        left(trim(NEW.file_name), 120),
        case when qpos is null then '' else format(' (position ~%s)', qpos) end
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'queue_position', qpos,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );

    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.queued',
      format('Import queued (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'queue_position', qpos,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );
  end if;

  if OLD.status is distinct from NEW.status and NEW.status = 'processing' then
    perform public.activity_logs_insert_safe(
      act_uid,
      'import_job',
      NEW.id,
      'import.processing',
      format('Import execution started (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );
  end if;

  if OLD.status = 'processing' and NEW.status = 'queued' then
    perform public.notification_enqueue(
      NEW.uploaded_by,
      'import_recovered',
      'Import returned to queue',
      format(
        'Import «%s» was re-queued after a stale or interrupted processing run.',
        left(trim(NEW.file_name), 120)
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
      'import.recovered_queue',
      format('Import re-queued after interruption (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'previous_status', OLD.status,
        'source', 'import_jobs'
      ))
    );
  end if;

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
  elsif do_activity_partial then
    perform public.notification_enqueue(
      NEW.uploaded_by,
      'import_partial_success',
      'Bulk import finished with issues',
      format(
        'Import «%s» completed with partial success — see activity for row-level failures.',
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
      'import.partial_success',
      format('Import partially completed (%s)', left(trim(NEW.file_name), 120)),
      jsonb_strip_nulls(jsonb_build_object(
        'import_job_id', NEW.id::text,
        'imported_rows', NEW.imported_rows,
        'invalid_rows', NEW.invalid_rows,
        'duplicate_rows', NEW.duplicate_rows,
        'total_rows', NEW.total_rows,
        'duration_ms',
        (extract(epoch from (NEW.completed_at - NEW.created_at)) * 1000)::bigint
      ))
    );
  elsif NEW.imported_rows is distinct from OLD.imported_rows
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


-- ── 9. Queue hint index (workers poll `queued` + active pipeline) ───────────

drop index if exists import_jobs_active_queue_hint_idx;

create index if not exists import_jobs_active_queue_hint_idx
  on public.import_jobs (status, created_at)
  where status in ('uploaded', 'validated', 'staging', 'staged', 'queued', 'processing');

create index if not exists import_jobs_queued_created_idx
  on public.import_jobs (status, created_at)
  where status = 'queued';
