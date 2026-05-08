-- ============================================================================
--  Dunite CMS — Posts: extended status set + published_at
-- ============================================================================
--
--  Companion to 0001_rbac.sql / 0002_posts_extras.sql. Idempotent — safe to
--  run repeatedly.
--
--  This migration grows the post lifecycle to match the production CMS UI:
--
--    draft       → user is still composing
--    scheduled   → committed, waiting for `scheduled_at`
--    publishing  → in-flight publish job (transient)
--    published   → live on every selected platform
--    failed      → publish job failed; user can retry / re-edit
--
--  Plus a `published_at` timestamp so feeds can show real "Posted X ago"
--  data instead of falling back to `updated_at`.
-- ============================================================================


-- ── 1. Drop any existing status check constraint (auto- or hand-named) ─────
do $$
declare
  c record;
begin
  for c in
    select conname
    from   pg_constraint
    where  conrelid = 'public.posts'::regclass
      and  contype  = 'c'
      and  pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.posts drop constraint %I', c.conname);
  end loop;
end $$;


-- ── 2. Re-add the broader CHECK constraint ─────────────────────────────────
alter table public.posts
  add constraint posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed'));


-- ── 3. Add published_at ────────────────────────────────────────────────────
alter table public.posts
  add column if not exists published_at timestamptz;

create index if not exists posts_published_at_idx on public.posts (published_at);


-- ── 4. Backfill: rows that already report status='published' but don't have
--      a timestamp get one based on updated_at, so the feed has something
--      real to show.
update public.posts
set    published_at = updated_at
where  status = 'published'
  and  published_at is null;
