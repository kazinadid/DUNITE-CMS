alter type post_status
add value if not exists 'retrying';

alter table public.posts
drop column if exists failure_sort_key;

alter table public.posts
add column failure_sort_key int generated always as (
case
when status in ('failed', 'retrying') then 0
else 1
end
) stored;

create index if not exists posts_failure_sort_created_idx
on public.posts (failure_sort_key, created_at desc);

create table if not exists public.publishing_jobs (
id uuid primary key default gen_random_uuid(),

post_id uuid not null
references public.posts(id)
on delete cascade,

platform text not null,

status text not null
check (
status in (
'queued',
'processing',
'succeeded',
'failed',
'retrying',
'cancelled'
)
),

attempt_count int not null default 0,
max_attempts int not null default 5,

scheduled_for timestamptz not null,

started_at timestamptz,
completed_at timestamptz,

last_error text,
next_retry_at timestamptz,

created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),

unique (post_id, platform)
);

create index if not exists publishing_jobs_post_id_idx
on public.publishing_jobs(post_id);

create index if not exists publishing_jobs_due_idx
on public.publishing_jobs(status, scheduled_for)
where status in ('queued', 'retrying');

create index if not exists publishing_jobs_platform_idx
on public.publishing_jobs(platform);

create table if not exists public.publishing_logs (
id uuid primary key default gen_random_uuid(),

post_id uuid not null
references public.posts(id)
on delete cascade,

publishing_job_id uuid
references public.publishing_jobs(id)
on delete set null,

platform text,

event_type text not null,
message text not null,

metadata jsonb not null default '{}'::jsonb,

created_by uuid
references auth.users(id)
on delete set null,

created_at timestamptz not null default now()
);

create index if not exists publishing_logs_post_created_idx
on public.publishing_logs(post_id, created_at desc);

create index if not exists publishing_logs_job_created_idx
on public.publishing_logs(publishing_job_id, created_at desc);

alter table public.publishing_jobs
enable row level security;

alter table public.publishing_logs
enable row level security;

drop policy if exists "publishing_jobs_read_authed"
on public.publishing_jobs;

create policy "publishing_jobs_read_authed"
on public.publishing_jobs
for select
to authenticated
using (true);

drop policy if exists "publishing_jobs_manage_writers"
on public.publishing_jobs;

create policy "publishing_jobs_manage_writers"
on public.publishing_jobs
for all
to authenticated
using (
public.can_manage_post(post_id)
)
with check (
public.can_manage_post(post_id)
);

drop policy if exists "publishing_logs_read_authed"
on public.publishing_logs;

create policy "publishing_logs_read_authed"
on public.publishing_logs
for select
to authenticated
using (true);

drop policy if exists "publishing_logs_insert_writers"
on public.publishing_logs;

create policy "publishing_logs_insert_writers"
on public.publishing_logs
for insert
to authenticated
with check (
public.can_manage_post(post_id)
);

create or replace function public.retry_publishing_job(
p_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
j public.publishing_jobs%rowtype;
backoff interval;
begin

select *
into j
from public.publishing_jobs
where id = p_job_id;

if not found then
raise exception 'job_not_found';
end if;

if not public.can_manage_post(j.post_id) then
raise exception 'forbidden';
end if;

if j.attempt_count >= j.max_attempts then
raise exception 'max_retries_exceeded';
end if;

backoff :=
interval '1 second'
* power(4::numeric, least(j.attempt_count, 4))::integer;

update public.publishing_jobs
set
status = 'queued',
scheduled_for = now() + backoff,
next_retry_at = now() + backoff,
last_error = null,
updated_at = now(),
attempt_count = j.attempt_count + 1
where id = p_job_id;

insert into public.publishing_logs (
post_id,
publishing_job_id,
platform,
event_type,
message,
metadata,
created_by
)
values (
j.post_id,
j.id,
j.platform,
'retry_scheduled',
format(
'Retry scheduled for %s after %s.',
j.platform,
backoff
),
jsonb_build_object(
'attempt',
j.attempt_count + 1,
'scheduled_for',
now() + backoff
),
auth.uid()
);

end;
$$;

revoke all on function public.retry_publishing_job(uuid)
from public;

grant execute on function public.retry_publishing_job(uuid)
to authenticated;
