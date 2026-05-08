-- ============================================================================
-- Dunite CMS — In-app notifications (user-isolated, backend-generated inserts)
-- ============================================================================
-- Recipients only see their own rows (RLS). INSERTs flow through SECURITY DEFINER
-- triggers / RPCs — not from anonymous client inserts.
-- Enable Supabase Realtime for low-latency in-app delivery (optional publish).
-- ============================================================================

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  type         text not null,
  title        text not null,
  message      text not null,
  metadata     jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint notifications_title_len check (length(title) <= 500),
  constraint notifications_message_len check (length(message) <= 2000)
);

comment on table public.notifications is
  'Per-user inbox. Server triggers enqueue rows; clients may UPDATE read/dismiss only.';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null and dismissed_at is null;

create index if not exists notifications_user_dismissed_idx
  on public.notifications (user_id, dismissed_at)
  where dismissed_at is not null;


-- ── Core enqueue (trigger / RPC — bypasses RLS as definer) ────────────────────

create or replace function public.notification_enqueue(
  p_user_id   uuid,
  p_type      text,
  p_title     text,
  p_message   text,
  p_metadata  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, type, title, message, metadata)
  values (
    p_user_id,
    left(p_type, 64),
    left(trim(p_title), 500),
    left(trim(p_message), 2000),
    case
      when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object'
        then coalesce(p_metadata, '{}'::jsonb)
      else '{}'::jsonb
    end
  )
  returning id into nid;

  return nid;
end;
$$;

revoke all on function public.notification_enqueue(uuid, text, text, text, jsonb) from public;


-- ── Optional: scheduling conflict — callable when calendar detects overlap ──

create or replace function public.notify_scheduling_conflict(
  p_post_id   uuid,
  p_detail    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  nid      uuid;
begin
  if not public.can_manage_post(p_post_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select user_id into owner_id from public.posts where id = p_post_id;
  if owner_id is null then
    return null;
  end if;

  select public.notification_enqueue(
    owner_id,
    'scheduling_conflict',
    'Scheduling conflict',
    coalesce(nullif(trim(p_detail), ''), 'This post overlaps another scheduled slot.'),
    jsonb_build_object('post_id', p_post_id::text, 'source', 'calendar')
  ) into nid;

  return nid;
end;
$$;

revoke all on function public.notify_scheduling_conflict(uuid, text) from public;
grant execute on function public.notify_scheduling_conflict(uuid, text) to authenticated;


-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;

drop policy if exists "notifications: select own" on public.notifications;
drop policy if exists "notifications: update own" on public.notifications;
drop policy if exists "notifications: delete own" on public.notifications;

create policy "notifications: select own"
  on public.notifications for select
  to authenticated
  using ( user_id = auth.uid() );

create policy "notifications: update own"
  on public.notifications for update
  to authenticated
  using      ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

create policy "notifications: delete own"
  on public.notifications for delete
  to authenticated
  using ( user_id = auth.uid() );


-- ── publishing_logs → post author ───────────────────────────────────────────

create or replace function public.notify_from_publishing_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author   uuid;
  ntype    text;
  ntitle   text;
  nmsg     text;
begin
  select p.user_id into author
  from public.posts p
  where p.id = NEW.post_id;

  if author is null then
    return NEW;
  end if;

  if NEW.event_type in ('jobs_rebuilt', 'jobs_reset', 'jobs_skipped') then
    return NEW;
  end if;

  if NEW.event_type = 'retry_scheduled' then
    perform public.notification_enqueue(
      author,
      'retry_scheduled',
      'Retry scheduled',
      NEW.message,
      jsonb_strip_nulls(jsonb_build_object(
        'post_id', NEW.post_id::text,
        'publishing_log_id', NEW.id::text,
        'platform', NEW.platform,
        'event_type', NEW.event_type,
        'source', 'publishing_logs'
      ))
    );
    return NEW;
  end if;

  if NEW.event_type ilike '%fail%'
     or NEW.message ilike '%fail%'
     or NEW.event_type ilike '%error%' then
    ntype  := 'publish_failure';
    ntitle := 'Publishing issue';
    nmsg   := NEW.message;
  elsif NEW.event_type ilike '%success%'
        or NEW.message ilike '%success%' then
    ntype  := 'publish_success';
    ntitle := 'Publish succeeded';
    nmsg   := NEW.message;
  else
    return NEW;
  end if;

  perform public.notification_enqueue(
    author,
    ntype,
    ntitle,
    nmsg,
    jsonb_strip_nulls(jsonb_build_object(
      'post_id', NEW.post_id::text,
      'publishing_log_id', NEW.id::text,
      'platform', NEW.platform,
      'event_type', NEW.event_type,
      'source', 'publishing_logs'
    ))
  );

  return NEW;
end;
$$;

drop trigger if exists notify_publishing_log_ai on public.publishing_logs;
create trigger notify_publishing_log_ai
  after insert on public.publishing_logs
  for each row execute function public.notify_from_publishing_log();


-- ── publishing_jobs → terminal failures / retries (dedupe-lite heuristics) ───

create or replace function public.notify_from_publishing_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  if TG_OP <> 'UPDATE' then
    return NEW;
  end if;

  select p.user_id into author
  from public.posts p
  where p.id = NEW.post_id;

  if author is null then
    return NEW;
  end if;

  if NEW.status = 'failed'
     and NEW.attempt_count >= NEW.max_attempts
     and (OLD.attempt_count is distinct from NEW.attempt_count
          or OLD.status is distinct from NEW.status) then
    perform public.notification_enqueue(
      author,
      'retry_failed',
      'Publishing exhausted retries',
      format(
        'Max retries reached for %s. Open the post to revise or reset.',
        NEW.platform
      ),
      jsonb_build_object(
        'post_id', NEW.post_id::text,
        'publishing_job_id', NEW.id::text,
        'platform', NEW.platform,
        'source', 'publishing_jobs'
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_publishing_job_au on public.publishing_jobs;
create trigger notify_publishing_job_au
  after update on public.publishing_jobs
  for each row execute function public.notify_from_publishing_job();


-- ── activity_logs → role changes targeting a user row ───────────────────────

create or replace function public.notify_from_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.entity_type = 'user'
     and NEW.action_type = 'user.role_changed'
     and NEW.entity_id is not null then
    perform public.notification_enqueue(
      NEW.entity_id,
      'role_change',
      'Your permissions changed',
      coalesce(nullif(trim(NEW.message), ''), 'Your workspace role was updated.'),
      jsonb_build_object(
        'activity_log_id', NEW.id::text,
        'source', 'activity_logs'
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_activity_log_ai on public.activity_logs;
create trigger notify_activity_log_ai
  after insert on public.activity_logs
  for each row execute function public.notify_from_activity_log();


-- ── Media: flag unusually large uploads (soft heuristic) ─────────────────────

create or replace function public.notify_from_media_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  select p.user_id into author from public.posts p where p.id = NEW.post_id;
  if author is null then
    return NEW;
  end if;

  if coalesce(NEW.size, 0) > 104857600 then -- 100 MiB
    perform public.notification_enqueue(
      author,
      'media_processing_issue',
      'Large media attachment',
      'A large file was attached — processing may take longer on some channels.',
      jsonb_build_object(
        'post_id', NEW.post_id::text,
        'media_id', NEW.id::text,
        'size', NEW.size,
        'source', 'media'
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists notify_media_ai on public.media;
create trigger notify_media_ai
  after insert on public.media
  for each row execute function public.notify_from_media_insert();


-- ── Token expiry placeholder (cron-ready): enqueue a single row per user ────
-- Wire your refresh-token monitor to call notification_enqueue with type
-- token_expiration when approaching expiry.

-- ── Realtime publication (Postgres) ───────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication not found — enable Realtime in the dashboard.';
end $$;
