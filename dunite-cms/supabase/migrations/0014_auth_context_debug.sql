-- ============================================================================
-- DUNITE CMS — temporary authenticated request diagnostics
-- ============================================================================
--
-- Lets server actions verify that PostgREST receives the user's JWT, so RLS
-- helpers can see `auth.uid()` and `public.current_user_role()`.

create or replace function public.debug_auth_context()
returns table (
  auth_uid uuid,
  current_user_role public.user_role
)
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid(), public.current_user_role();
$$;

revoke all on function public.debug_auth_context() from public;
grant execute on function public.debug_auth_context() to authenticated;
