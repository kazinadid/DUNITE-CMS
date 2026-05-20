-- Calendar read/write performance hardening.
-- Safe to run repeatedly (IF NOT EXISTS).

create index if not exists posts_calendar_scheduled_at_idx
  on public.posts (scheduled_at)
  where scheduled_at is not null;

create index if not exists posts_calendar_org_scheduled_idx
  on public.posts (organization_id, scheduled_at)
  where scheduled_at is not null;

create index if not exists posts_calendar_org_status_scheduled_idx
  on public.posts (organization_id, status, scheduled_at)
  where scheduled_at is not null;
