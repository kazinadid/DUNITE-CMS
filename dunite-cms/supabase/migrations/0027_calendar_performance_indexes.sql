-- Migration 0027: Calendar Performance Indexes
-- Adds optimized indexes for calendar queries with large datasets

-- Composite index for common calendar filter combinations (org + status + date)
CREATE INDEX IF NOT EXISTS posts_calendar_org_status_scheduled_idx
  ON public.posts (organization_id, status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Index for platform filtering with date range (used when filtering by platform)
CREATE INDEX IF NOT EXISTS post_platforms_platform_post_idx
  ON public.post_platforms (platform, post_id);

-- Index for user filtering in calendar (admin user filter)
CREATE INDEX IF NOT EXISTS posts_calendar_user_scheduled_idx
  ON public.posts (user_id, scheduled_at DESC)
  WHERE scheduled_at IS NOT NULL;

-- Partial index for failed/retrying posts (used by failedOnly filter)
CREATE INDEX IF NOT EXISTS posts_failed_scheduled_idx
  ON public.posts (organization_id, scheduled_at DESC)
  WHERE status IN ('failed', 'retrying') AND scheduled_at IS NOT NULL;

-- Index for media-only filtering optimization
CREATE INDEX IF NOT EXISTS media_post_id_idx
  ON public.media (post_id);

-- Covering index for calendar list queries (includes commonly selected columns)
-- This is a "covering index" that includes all columns needed for calendar list views
CREATE INDEX IF NOT EXISTS posts_calendar_covering_idx
  ON public.posts (organization_id, scheduled_at DESC)
  INCLUDE (status, user_id, content, created_at, updated_at)
  WHERE scheduled_at IS NOT NULL;

-- Index for publishing jobs by status and scheduled time (worker optimization)
CREATE INDEX IF NOT EXISTS publishing_jobs_status_scheduled_platform_idx
  ON public.publishing_jobs (status, scheduled_for, platform)
  WHERE status IN ('queued', 'retrying');

-- Index for organization-scoped publishing jobs
CREATE INDEX IF NOT EXISTS publishing_jobs_post_status_idx
  ON public.publishing_jobs (post_id, status)
  WHERE status IN ('queued', 'retrying');