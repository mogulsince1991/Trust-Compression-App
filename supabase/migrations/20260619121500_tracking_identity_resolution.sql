alter table public.tracking_events
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists tracking_events_contact_occurred_idx
  on public.tracking_events (contact_id, occurred_at desc)
  where contact_id is not null;

create table if not exists public.tracking_identities (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visitor_id text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  email text,
  phone text,
  name text,
  company text,
  external_id text,
  crm_source text,
  first_tracking_link_id uuid references public.tracking_links(id) on delete set null,
  last_tracking_link_id uuid references public.tracking_links(id) on delete set null,
  first_journey_id uuid references public.journeys(id) on delete set null,
  last_journey_id uuid references public.journeys(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, visitor_id)
);

create index if not exists tracking_identities_workspace_last_seen_idx
  on public.tracking_identities (workspace_id, last_seen_at desc);

create index if not exists tracking_identities_contact_idx
  on public.tracking_identities (contact_id)
  where contact_id is not null;

create index if not exists tracking_identities_email_idx
  on public.tracking_identities (workspace_id, email)
  where email is not null;

alter table public.tracking_identities enable row level security;
alter table public.tracking_identities force row level security;

revoke all on public.tracking_identities from anon;
grant select on public.tracking_identities to authenticated;
grant select, insert, update, delete on public.tracking_identities to service_role;

drop policy if exists "Workspace members can read tracking identities" on public.tracking_identities;
create policy "Workspace members can read tracking identities"
  on public.tracking_identities
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop trigger if exists tracking_identities_touch_updated_at on public.tracking_identities;
create trigger tracking_identities_touch_updated_at
  before update on public.tracking_identities
  for each row execute function public.touch_updated_at();
