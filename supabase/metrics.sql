-- Counters only. No user data, no rows per visit, no identifiers, no timestamps
-- per event — one row per metric name holding a single integer.
--
-- Run this once in the Supabase SQL editor.
--
-- Why a function instead of an UPDATE from the app: two visitors landing at the
-- same moment would both read N and both write N+1, losing a count. The upsert
-- below does the read and write in one statement, so Postgres serialises them.

create table if not exists public.metrics (
  name  text primary key,
  count bigint not null default 0
);

create or replace function public.increment_metric(metric_name text)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.metrics (name, count)
  values (metric_name, 1)
  on conflict (name)
    do update set count = public.metrics.count + 1
  returning count;
$$;

-- The table is reached only through the service-role key on the server, so RLS
-- stays on with no policies: anonymous clients cannot read or write it directly.
alter table public.metrics enable row level security;

-- Seed the known names so a fresh dashboard shows zeros rather than nothing.
insert into public.metrics (name, count) values
  ('home_view', 0),
  ('assessment_view', 0),
  ('score_calculated', 0),
  ('question_asked', 0),
  ('rules_view', 0),
  ('how_it_works_view', 0)
on conflict (name) do nothing;
