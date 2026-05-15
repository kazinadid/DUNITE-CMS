-- ============================================================================
-- DUNITE CMS — Extend public.post_status enum (Import queue + cancellation)
-- ============================================================================
-- Inserts failed with: invalid input value for enum post_status: "queued"
-- because CHECK constraints do not extend enum types; labels must be added via
-- ALTER TYPE. A follow-up migration updates posts_status_check to allow
-- `cancelled` — kept separate so enum values commit before they are referenced.
-- ============================================================================

alter type public.post_status add value if not exists 'queued';
alter type public.post_status add value if not exists 'cancelled';
