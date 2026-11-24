-- Table behind the extension's anonymous usage stats (see PRIVACY.md).
-- Run once in the Supabase SQL editor for the project in USAGE_URL (background.js).
-- The extension can only INSERT with the public key; it cannot read anything back.

create table if not exists public.usage_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text  not null,
  version    text,
  props      jsonb not null default '{}'::jsonb
);

alter table public.usage_events enable row level security;

drop policy if exists "extension can insert usage events" on public.usage_events;
create policy "extension can insert usage events"
  on public.usage_events for insert to anon
  with check (
    name in ('extension_start', 'cat_shown', 'break_ended')
    and pg_column_size(props) < 1024
  );

-- Example: is the cat loading?
--   select props->>'outcome' as outcome, props->>'reason' as reason, count(*)
--   from usage_events where name = 'cat_shown' and created_at > now() - interval '7 days'
--   group by 1, 2 order by 3 desc;

-- Example: which built-in sites trigger the most breaks?
--   select props->>'site' as site, count(*) from usage_events
--   where name = 'break_ended' group by 1 order by 2 desc;
