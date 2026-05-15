-- ============================================================================
-- DUNITE CMS — posts.status: add queued lifecycle state
-- ============================================================================
-- Keeps backward compatibility while allowing import execution to create posts
-- that are ready for publishing-job queue processing.
--
-- If `posts.status` uses the `post_status` enum, you must also run migration
-- 0017 (enum labels) — CHECK constraints alone cannot add enum values.
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
    'retrying'
  )
);
