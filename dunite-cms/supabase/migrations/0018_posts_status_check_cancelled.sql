-- ============================================================================
-- DUNITE CMS — posts.status CHECK: allow `cancelled` (runs after enum extend)
-- ============================================================================

alter table public.posts
drop constraint if exists posts_status_check;

alter table public.posts
add constraint posts_status_check
check (
  status in (
    'draft',
    'scheduled',
    'queued',
    'publishing',
    'published',
    'failed',
    'retrying',
    'cancelled'
  )
);
