create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'support_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id text,
  surface text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists app_activity_events_occurred_at_idx
  on public.app_activity_events (occurred_at desc);
create index if not exists app_activity_events_workspace_occurred_idx
  on public.app_activity_events (workspace_id, occurred_at desc);
create index if not exists app_activity_events_actor_occurred_idx
  on public.app_activity_events (actor_user_id, occurred_at desc);
create index if not exists app_activity_events_type_occurred_idx
  on public.app_activity_events (event_type, occurred_at desc);

alter table public.platform_admins enable row level security;
alter table public.app_activity_events enable row level security;

revoke all on public.platform_admins from anon, authenticated;
revoke all on public.app_activity_events from anon, authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;
grant select, insert on public.app_activity_events to service_role;

insert into public.platform_admins (user_id, role)
select id, 'super_admin'
from auth.users
where lower(email) in ('admin@unmarked.media', 'mogundipe@gmail.com')
on conflict (user_id) do update
set role = excluded.role, active = true, updated_at = now();

comment on table public.platform_admins is 'Service-role-only platform authorization. Workspace roles never grant platform access.';
comment on table public.app_activity_events is 'Append-only, non-sensitive product activity audit stream.';
