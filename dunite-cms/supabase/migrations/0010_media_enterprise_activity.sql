-- ============================================================================
-- DUNITE CMS — Media enterprise: dimensions, library activity + notifications
-- Backward-compatible: additive columns only; extends triggers; no breaking RLS.
-- ============================================================================

-- ── Dimensions (nullable; populated by clients when available) ─────────────

alter table public.media add column if not exists width_px int;
alter table public.media add column if not exists height_px int;

comment on column public.media.width_px is
  'Natural width in pixels when known (typically images). Client-populated.';
comment on column public.media.height_px is
  'Natural height in pixels when known (typically images). Client-populated.';

create index if not exists media_dimensions_idx
  on public.media (width_px, height_px)
  where width_px is not null and height_px is not null;

-- ── Large library uploads — notify owning user (composer path already covers post attaches) ─

create or replace function public.notify_from_media_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  if NEW.post_id is not null then
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
  end if;

  -- Central library asset (post_id IS NULL): notify uploader only.
  if coalesce(NEW.is_library, false) = true and NEW.user_id is not null then
    if coalesce(NEW.size, 0) > 104857600 then
      perform public.notification_enqueue(
        NEW.user_id,
        'media_processing_issue',
        'Large library upload',
        'A large file was added to Media Library — delivery may take longer on some networks.',
        jsonb_build_object(
          'media_id', NEW.id::text,
          'size', NEW.size,
          'source', 'media_library',
          'is_library', true
        )
      );
    end if;
  end if;

  return NEW;
end;
$$;


-- ── Activity: richer library uploads + folder changes ─────────────────────────

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
  msg text;
begin
  if coalesce(NEW.is_library, false) = true and NEW.post_id is null then
    msg := format('Library asset uploaded (%s).', label);
  else
    msg := format('Media uploaded (%s).', label);
  end if;

  perform public.activity_logs_insert_safe(
    auth.uid(),
    'media',
    NEW.id,
    case when coalesce(NEW.is_library, false) = true and NEW.post_id is null then
      'media.library_uploaded' else 'media.uploaded'
    end,
    msg,
    jsonb_strip_nulls(jsonb_build_object(
      'post_id', NEW.post_id::text,
      'media_id', NEW.id::text,
      'file_name', left(coalesce(NEW.file_name, ''), 260),
      'mime_type', left(coalesce(NEW.mime_type, ''), 160),
      'size', NEW.size,
      'is_library', NEW.is_library,
      'library_owner_id', NEW.user_id::text
    ))
  );

  return NEW;
end;
$$;


create or replace function public.activity_media_library_au()
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
      'asset'
    );
begin
  if coalesce(NEW.is_library, false) is not true then
    return NEW;
  end if;

  if OLD.category_id is distinct from NEW.category_id then
    perform public.activity_logs_insert_safe(
      auth.uid(),
      'media',
      NEW.id,
      'media.library_category_changed',
      format('Library folder updated for %s.', label),
      jsonb_strip_nulls(jsonb_build_object(
        'media_id', NEW.id::text,
        'from_category_id', OLD.category_id::text,
        'to_category_id', NEW.category_id::text,
        'library_owner_id', NEW.user_id::text,
        'is_library', true
      ))
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists activity_media_library_au on public.media;
create trigger activity_media_library_au
  after update on public.media
  for each row execute function public.activity_media_library_au();


create or replace function public.activity_media_library_ad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text :=
    coalesce(
      nullif(trim(coalesce(OLD.file_name, '')), ''),
      OLD.file_type,
      'asset'
    );
begin
  if coalesce(OLD.is_library, false) is not true then
    return OLD;
  end if;

  perform public.activity_logs_insert_safe(
    auth.uid(),
    'media',
    OLD.id,
    'media.library_deleted',
    format('Library asset removed (%s).', label),
    jsonb_strip_nulls(jsonb_build_object(
      'media_id', OLD.id::text,
      'file_name', left(coalesce(OLD.file_name, ''), 260),
      'library_owner_id', OLD.user_id::text,
      'is_library', true
    ))
  );

  if OLD.user_id is not null and OLD.user_id is distinct from auth.uid() then
    perform public.notification_enqueue(
      OLD.user_id,
      'media_library_removed',
      'Library asset removed',
      format('An administrator removed «%s» from the media library.', left(label, 120)),
      jsonb_build_object(
        'media_id', OLD.id::text,
        'source', 'media_library',
        'removed_by', auth.uid()::text
      )
    );
  end if;

  return OLD;
end;
$$;

drop trigger if exists activity_media_library_ad on public.media;
create trigger activity_media_library_ad
  after delete on public.media
  for each row execute function public.activity_media_library_ad();

-- ── Activity log read scope: tombstone visibility for deleted library rows ─────
-- Existing policy requires FK to `media`; after delete no row survives. Extend so
-- the original uploader can still see `media.library_deleted` entries they own.

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
  );
