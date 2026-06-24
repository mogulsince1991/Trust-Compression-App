create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  business_profile_id uuid,
  business_profile_label text,
  platform text not null check (platform in ('instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'x', 'other')),
  username text,
  profile_url text,
  profile_key text not null,
  display_name text,
  avatar_url text,
  latest_cached_metrics jsonb not null default '{}'::jsonb,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_profiles_workspace_profile_key_key unique (workspace_id, profile_key)
);

create index if not exists social_profiles_workspace_idx
  on public.social_profiles (workspace_id, updated_at desc);

create index if not exists social_profiles_platform_idx
  on public.social_profiles (workspace_id, platform);

alter table public.social_profiles enable row level security;

grant select, insert, update, delete on public.social_profiles to authenticated;
revoke all on public.social_profiles from anon;

drop policy if exists "Workspace members can read social profiles" on public.social_profiles;
create policy "Workspace members can read social profiles"
  on public.social_profiles
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can insert social profiles" on public.social_profiles;
create policy "Workspace members can insert social profiles"
  on public.social_profiles
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update social profiles" on public.social_profiles;
create policy "Workspace members can update social profiles"
  on public.social_profiles
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can delete social profiles" on public.social_profiles;
create policy "Workspace members can delete social profiles"
  on public.social_profiles
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));
