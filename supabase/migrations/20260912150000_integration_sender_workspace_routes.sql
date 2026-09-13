create table if not exists public.workspace_integration_sender_routes (
  id uuid primary key default gen_random_uuid(),
  integration_key_id uuid not null references public.workspace_integration_keys(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_number text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_key_id, workspace_id, phone_number)
);

create index if not exists workspace_integration_sender_routes_workspace_idx
  on public.workspace_integration_sender_routes (workspace_id, integration_key_id);

alter table public.workspace_integration_sender_routes enable row level security;
alter table public.workspace_integration_sender_routes force row level security;
revoke all on public.workspace_integration_sender_routes from anon, authenticated;
grant select, insert, update, delete on public.workspace_integration_sender_routes to service_role;

drop trigger if exists workspace_integration_sender_routes_touch_updated_at on public.workspace_integration_sender_routes;
create trigger workspace_integration_sender_routes_touch_updated_at
before update on public.workspace_integration_sender_routes
for each row execute function public.touch_updated_at();
