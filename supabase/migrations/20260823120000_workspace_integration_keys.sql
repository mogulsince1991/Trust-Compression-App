create table if not exists public.workspace_integration_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  scopes jsonb not null default '["library:import"]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_integration_keys_workspace_idx
  on public.workspace_integration_keys (workspace_id, created_at desc);

alter table public.workspace_integration_keys enable row level security;
alter table public.workspace_integration_keys force row level security;
revoke all on public.workspace_integration_keys from anon, authenticated;
grant select, insert, update, delete on public.workspace_integration_keys to service_role;

drop trigger if exists workspace_integration_keys_touch_updated_at on public.workspace_integration_keys;
create trigger workspace_integration_keys_touch_updated_at
before update on public.workspace_integration_keys
for each row execute function public.touch_updated_at();

