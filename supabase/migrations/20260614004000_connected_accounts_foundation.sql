create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('google_drive', 'youtube', 'google', 'ghl', 'instagram', 'facebook')),
  account_label text,
  external_account_id text,
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_account_id)
);

create index if not exists connected_accounts_workspace_provider_idx
  on public.connected_accounts (workspace_id, provider);

create index if not exists connected_accounts_user_idx
  on public.connected_accounts (user_id);

alter table public.sources
  add column if not exists connected_account_id uuid references public.connected_accounts(id) on delete set null;
