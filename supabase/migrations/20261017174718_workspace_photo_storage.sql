create table public.workspace_photo_storage (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 connection_id uuid not null default gen_random_uuid(),
 provider text not null default 'google_drive' check(provider='google_drive'),
 account_label text not null,
 folder_id text not null,
 folder_name text not null,
 credentials text not null,
 connected_by uuid references auth.users(id) on delete set null,
 status text not null default 'connected',
 last_error text,
 updated_at timestamptz not null default now()
);
alter table public.workspace_photo_storage enable row level security;
revoke all on public.workspace_photo_storage from public, anon, authenticated;
grant all on public.workspace_photo_storage to service_role;
create table public.photo_storage_oauth_states (
 state_hash text primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 verifier text not null,
 expires_at timestamptz not null default now() + interval '10 minutes'
);
alter table public.photo_storage_oauth_states enable row level security;
revoke all on public.photo_storage_oauth_states from public, anon, authenticated;
grant all on public.photo_storage_oauth_states to service_role;
