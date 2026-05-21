-- ============================================================================
-- DUNITE CMS — Fix activity_logs SELECT policy
-- ============================================================================
-- Problem:
--   authenticated role has no SELECT on public.social_accounts (revoked in
--   0020 in favor of social_accounts_safe). The previous policy's EXISTS
--   still referenced the base table directly, causing PostgREST to fail the
--   entire activity_logs query with error 42501 (insufficient privilege).
--
-- Fix:
--   Replace public.social_accounts reference with public.social_accounts_safe
--   in the social_account entity_type branch. All other branches unchanged.
--
-- Safe to run:
--   DROP POLICY IF EXISTS = no error if policy missing
--   No schema changes, no data changes, no new dependencies
--   Rollback: rerun previous policy version
-- ============================================================================


-- ── 0. Pre-flight check ───────────────────────────────────────────────────────
do $$
begin
  -- Verify social_accounts_safe view exists before proceeding
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'social_accounts_safe'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.social_accounts_safe view does not exist. '
      'Run migration 0020 first before applying this fix.';
  end if;

  -- Verify activity_logs table exists
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'activity_logs'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.activity_logs does not exist.';
  end if;

  -- Verify organization_members table exists
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'organization_members'
  ) then
    raise exception
      'MISSING DEPENDENCY: public.organization_members does not exist.';
  end if;
end $$;


-- ── 1. Drop existing broken policy ───────────────────────────────────────────
drop policy if exists "activity_logs: select scoped" on public.activity_logs;


-- ── 2. Recreate fixed policy ──────────────────────────────────────────────────
create policy "activity_logs: select scoped"
  on public.activity_logs for select
  to authenticated
  using (
    -- Global admin or super admin sees everything
    public.current_user_role() = 'admin'
    or public.is_super_admin()

    -- Post events: visible if post exists
    or (
      entity_type = 'post'
      and entity_id is not null
      and exists (
        select 1 from public.posts p
        where p.id = entity_id
      )
    )

    -- Media events: visible if media exists or user owns deleted library
    or (
      entity_type = 'media'
      and entity_id is not null
      and (
        exists (
          select 1 from public.media m
          where m.id = entity_id
        )
        or (
          action_type = 'media.library_deleted'
          and coalesce(metadata->>'library_owner_id', '') <> ''
          and (metadata->>'library_owner_id')::uuid = auth.uid()
        )
      )
    )

    -- Post platform events: visible if related post exists
    or (
      entity_type = 'post_platform'
      and entity_id is not null
      and exists (
        select 1 from public.posts p
        where p.id = entity_id
      )
    )

    -- User events: visible to the user themselves or admin
    or (
      entity_type = 'user'
      and entity_id is not null
      and (
        entity_id = auth.uid()
        or public.current_user_role() = 'admin'
      )
    )

    -- Social account events: FIXED — uses social_accounts_safe instead of
    -- base social_accounts table (authenticated has no SELECT on base table)
    or (
      entity_type = 'social_account'
      and (
        user_id = auth.uid()
        or public.current_user_role() = 'admin'
        or (
          entity_id is not null
          and exists (
            select 1
            from public.social_accounts_safe sa        -- FIXED: safe view
            join public.organization_members om
              on om.organization_id = sa.organization_id
              and om.user_id = auth.uid()
            where sa.id = entity_id
          )
        )
      )
    )
  );


-- ── 3. Verification ───────────────────────────────────────────────────────────
-- Confirm policy was created successfully
select
  policyname,
  tablename,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename  = 'activity_logs'
  and policyname = 'activity_logs: select scoped'; 