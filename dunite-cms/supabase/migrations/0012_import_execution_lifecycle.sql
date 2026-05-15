-- ============================================================================
-- Dunite CMS — Import job execution lifecycle (staging → execute → terminal)
-- ============================================================================
-- Extends import_jobs.status values, adds execution_stats JSON, and expands
-- lifecycle + activity/notification triggers for staged / processing /
-- partial_success flows. Idempotent where possible.
-- ============================================================================

-- ── 1. execution_stats (chunked worker / UI polling) ─────────────────────────

alter table public.import_jobs
  add column if not exists execution_stats jsonb not null default '{}'::jsonb;

comment on column public.import_jobs.execution_stats is
  'Opaque counters for UI/workers: processed, succeeded, failed, skipped_duplicate, etc.';


-- ── 2. Widen status enum (replace CHECK) ────────────────────────────────────

alter table public.import_jobs drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
  add constraint import_jobs_status_check
  check (status in (
    'uploaded',
    'validating',
    'validated',
    'staging',
    'staged',
    'processing',
    'completed',
    'partial_success',
    'failed',
    'cancelled'
  ));


-- ── 3. Lifecycle timestamps ─────────────────────────────────────────────────

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

  return NEW;
end;
$$;


-- ── 4. Activity + notifications (extend prior trigger body) ─────────────────

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


-- ── 5. Queue hint index (include staged / staging) ───────────────────────────

drop index if exists import_jobs_active_queue_hint_idx;

create index if not exists import_jobs_active_queue_hint_idx
  on public.import_jobs (status, created_at)
  where status in ('uploaded', 'validated', 'staging', 'staged', 'processing');
