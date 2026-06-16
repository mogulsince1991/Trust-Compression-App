create table if not exists public.tracking_links (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journey_id uuid references public.journeys(id) on delete set null,
  title text not null,
  slug text not null unique,
  destination_url text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_events (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tracking_link_id uuid not null references public.tracking_links(id) on delete cascade,
  journey_id uuid references public.journeys(id) on delete set null,
  event_type text not null check (event_type in ('redirect', 'page_view', 'cta_click')),
  visit_id text,
  visitor_id text,
  session_id text,
  page_url text,
  referrer_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tracking_links_workspace_created_idx on public.tracking_links (workspace_id, created_at desc);
create index if not exists tracking_links_journey_idx on public.tracking_links (journey_id);
create index if not exists tracking_events_workspace_created_idx on public.tracking_events (workspace_id, created_at desc);
create index if not exists tracking_events_link_created_idx on public.tracking_events (tracking_link_id, created_at desc);
create index if not exists tracking_events_visit_idx on public.tracking_events (visit_id);

drop trigger if exists tracking_links_touch_updated_at on public.tracking_links;

create trigger tracking_links_touch_updated_at
  before update on public.tracking_links
  for each row execute function public.touch_updated_at();

alter table public.tracking_links enable row level security;
alter table public.tracking_events enable row level security;
alter table public.tracking_links force row level security;
alter table public.tracking_events force row level security;

revoke all on public.tracking_links from anon;
revoke all on public.tracking_events from anon;

grant select, insert, update, delete on public.tracking_links to authenticated;
grant select on public.tracking_events to authenticated;
grant select, insert, update, delete on public.tracking_links to service_role;
grant select, insert, update, delete on public.tracking_events to service_role;

drop policy if exists "Workspace members can manage tracking links" on public.tracking_links;
create policy "Workspace members can manage tracking links"
  on public.tracking_links
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can read tracking events" on public.tracking_events;
create policy "Workspace members can read tracking events"
  on public.tracking_events
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));
