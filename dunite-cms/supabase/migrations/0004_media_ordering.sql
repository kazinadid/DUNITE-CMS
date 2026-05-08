-- ============================================================================
--  Dunite CMS — Media: explicit per-post ordering
-- ============================================================================
--
--  Companion to 0002_posts_extras.sql / 0003_posts_status_extras.sql.
--  Idempotent — safe to run repeatedly.
--
--  The composer now lets users drag media items into a specific carousel
--  order (Instagram / Facebook). We persist that order in `order_index`
--  so the feed and the platforms see exactly what the author arranged.
-- ============================================================================


-- ── 1. Column ───────────────────────────────────────────────────────────────
alter table public.media
  add column if not exists order_index integer not null default 0;


-- ── 2. Index for fast per-post ordered reads ────────────────────────────────
create index if not exists media_post_order_idx
  on public.media (post_id, order_index);


-- ── 3. Backfill: rows that pre-date this column get sequential indices
--      based on created_at, so the feed renders something sensible.
do $$
declare
  r record;
  i integer;
  current_post uuid;
begin
  current_post := null;
  i := 0;
  for r in
    select id, post_id
    from   public.media
    order  by post_id, created_at, id
  loop
    if current_post is null or r.post_id <> current_post then
      current_post := r.post_id;
      i := 0;
    end if;

    update public.media set order_index = i where id = r.id and order_index = 0;
    i := i + 1;
  end loop;
end $$;
