-- ── SECURITY DEFINER insert (used by triggers only) ─────────────────────────

create or replace function public.activity_logs_insert_safe(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action_type text,
  p_message text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
  meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_message is null or length(trim(p_message)) = 0 then
    p_message := replace(p_action_type, '_', ' ');
  end if;

  insert into public.activity_logs (
    user_id,
    entity_type,
    entity_id,
    action_type,
    message,
    metadata
  )
  values (
    p_user_id,
    p_entity_type,
    p_entity_id,
    p_action_type,
    left(trim(p_message), 2048),
    case
      when jsonb_typeof(meta) = 'object' then meta
      else '{}'::jsonb
    end
  )
  returning id into nid;

  return nid;
end;
$$;

revoke all on function public.activity_logs_insert_safe(uuid, text, uuid, text, text, jsonb)
  from public;


-- ── RLS (scoped read — no JWT writes) ───────────────────────────────────────

alter table public.activity_logs enable row level security;

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
      and exists (select 1 from public.media m where m.id = entity_id)
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
  );


-- ── Posts lifecycle ─────────────────────────────────────────────────────────

create or replace function public.activity_posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'post',
    NEW.id,
    'post.created',
    'Post created.',
    jsonb_build_object(
      'post_id', NEW.id::text,
      'status', NEW.status,
      'author_id', NEW.user_id::text
    )
  );
  return NEW;
end;
$$;

create or replace function public.activity_posts_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status is distinct from NEW.status then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'post',
      NEW.id,
      'post.status_changed',
      format('Status changed from %s to %s.', OLD.status, NEW.status),
      jsonb_build_object(
        'post_id', NEW.id::text,
        'from_status', OLD.status,
        'to_status', NEW.status
      )
    );
  end if;

  if coalesce(OLD.scheduled_at, timestamptz 'epoch')
     is distinct from coalesce(NEW.scheduled_at, timestamptz 'epoch') then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'post',
      NEW.id,
      'post.schedule_changed',
      'Schedule updated.',
      jsonb_build_object(
        'post_id', NEW.id::text,
        'scheduled_at_was', OLD.scheduled_at,
        'scheduled_at', NEW.scheduled_at
      )
    );
  end if;

  if OLD.content is distinct from NEW.content then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'post',
      NEW.id,
      'post.content_edited',
      'Post content edited.',
      jsonb_build_object(
        'post_id', NEW.id::text,
        'preview', left(NEW.content, 180)
      )
    );
  end if;

  if coalesce(OLD.published_at, timestamptz 'epoch')
     is distinct from coalesce(NEW.published_at, timestamptz 'epoch') then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'post',
      NEW.id,
      'post.publish_timestamps_updated',
      'Publishing timestamps updated.',
      jsonb_build_object(
        'post_id', NEW.id::text,
        'published_at_was', OLD.published_at,
        'published_at', NEW.published_at
      )
    );
  end if;

  return NEW;
end;
$$;

create or replace function public.activity_posts_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'post',
    OLD.id,
    'post.deleted',
    'Post deleted.',
    jsonb_build_object(
      'post_id', OLD.id::text,
      'author_id', OLD.user_id::text,
      'status', OLD.status
    )
  );
  return OLD;
end;
$$;

drop trigger if exists activity_posts_ai on public.posts;
create trigger activity_posts_ai
  after insert on public.posts
  for each row execute function public.activity_posts_after_insert();

drop trigger if exists activity_posts_au on public.posts;
create trigger activity_posts_au
  after update on public.posts
  for each row execute function public.activity_posts_after_update();

drop trigger if exists activity_posts_bd on public.posts;
create trigger activity_posts_bd
  before delete on public.posts
  for each row execute function public.activity_posts_before_delete();


-- ── post_platforms ─────────────────────────────────────────────────────────

create or replace function public.activity_post_platforms_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'post_platform',
    NEW.post_id,
    'post.platform_linked',
    format('Platform %s attached.', NEW.platform),
    jsonb_build_object(
      'post_id', NEW.post_id::text,
      'platform', NEW.platform
    )
  );
  return NEW;
end;
$$;

create or replace function public.activity_post_platforms_ad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'post_platform',
    OLD.post_id,
    'post.platform_unlinked',
    format('Platform %s removed.', OLD.platform),
    jsonb_build_object(
      'post_id', OLD.post_id::text,
      'platform', OLD.platform
    )
  );
  return OLD;
end;
$$;

drop trigger if exists activity_post_platforms_ai on public.post_platforms;
create trigger activity_post_platforms_ai
  after insert on public.post_platforms
  for each row execute function public.activity_post_platforms_ai();

drop trigger if exists activity_post_platforms_ad on public.post_platforms;
create trigger activity_post_platforms_ad
  after delete on public.post_platforms
  for each row execute function public.activity_post_platforms_ad();


-- ── Media uploads ───────────────────────────────────────────────────────────

create or replace function public.activity_media_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text :=
    coalesce(
      nullif(trim(coalesce(NEW.file_name, '')), ''),
      NEW.file_type,
      'file'
    );
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'media',
    NEW.id,
    'media.uploaded',
    format('Media uploaded (%s).', label),
    jsonb_build_object(
      'post_id', NEW.post_id::text,
      'media_id', NEW.id::text,
      'file_name', left(coalesce(NEW.file_name, ''), 260),
      'mime_type', left(coalesce(NEW.mime_type, ''), 160),
      'size', NEW.size
    )
  );
  return NEW;
end;
$$;

drop trigger if exists activity_media_ai on public.media;
create trigger activity_media_ai
  after insert on public.media
  for each row execute function public.activity_media_ai();


-- ── Publishing logs mirror ──────────────────────────────────────────────────

create or replace function public.activity_publishing_logs_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.event_type in ('jobs_rebuilt', 'jobs_reset', 'jobs_skipped') then
    return NEW;
  end if;

  perform public.activity_logs_insert_safe(
    coalesce(NEW.created_by, auth.uid()),
    'post',
    NEW.post_id,
    format('publishing.%s', NEW.event_type),
    NEW.message,
    jsonb_strip_nulls(jsonb_build_object(
      'post_id', NEW.post_id::text,
      'publishing_log_id', NEW.id::text,
      'publishing_job_id', NEW.publishing_job_id::text,
      'platform', NEW.platform,
      'event_type', NEW.event_type,
      'source', 'publishing_logs'
    )) || coalesce(NEW.metadata, '{}'::jsonb)
  );

  return NEW;
end;
$$;

drop trigger if exists activity_publishing_logs_ai on public.publishing_logs;
create trigger activity_publishing_logs_ai
  after insert on public.publishing_logs
  for each row execute function public.activity_publishing_logs_ai();


-- ── Worker publish_events mirror ────────────────────────────────────────────

create or replace function public.activity_post_publish_events_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.activity_logs_insert_safe(
    auth.uid(),
    'post',
    NEW.post_id,
    format('publishing.worker.%s', NEW.kind),
    NEW.message,
    jsonb_build_object(
      'post_id', NEW.post_id::text,
      'publish_event_id', NEW.id::text,
      'kind', NEW.kind,
      'source', 'post_publish_events'
    )
  );

  return NEW;
end;
$$;

drop trigger if exists activity_post_publish_events_ai on public.post_publish_events;
create trigger activity_post_publish_events_ai
  after insert on public.post_publish_events
  for each row execute function public.activity_post_publish_events_ai();


-- ── User / RBAC activity ────────────────────────────────────────────────────

create or replace function public.activity_users_au()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.role is distinct from NEW.role then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'user',
      NEW.id,
      'user.role_changed',
      format(
        'User role updated for %s.',
        coalesce(split_part(NEW.email, '@', 1), NEW.id::text)
      ),
      jsonb_build_object(
        'user_id', NEW.id::text,
        'from_role', OLD.role::text,
        'to_role', NEW.role::text
      )
    );
  elsif coalesce(trim(coalesce(OLD.name, '')), '')
        is distinct from coalesce(trim(coalesce(NEW.name, '')), '') then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'user',
      NEW.id,
      'user.profile_updated',
      'Profile updated.',
      jsonb_build_object(
        'user_id', NEW.id::text,
        'name_was', OLD.name,
        'name', NEW.name
      )
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists activity_users_au on public.users;
create trigger activity_users_au
  after update on public.users
  for each row execute function public.activity_users_au();