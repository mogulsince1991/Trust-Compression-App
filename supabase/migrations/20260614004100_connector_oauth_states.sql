create table if not exists public.connector_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text unique not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index if not exists connector_oauth_states_state_idx on public.connector_oauth_states (state);
create index if not exists connector_oauth_states_expiry_idx on public.connector_oauth_states (expires_at);
