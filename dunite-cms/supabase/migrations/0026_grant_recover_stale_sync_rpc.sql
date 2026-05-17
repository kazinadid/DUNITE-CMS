-- Ensure service_role may invoke stale-sync recovery outside PostgREST auth defaults.
grant execute on function public.recover_stale_syncing_posts() to service_role;
