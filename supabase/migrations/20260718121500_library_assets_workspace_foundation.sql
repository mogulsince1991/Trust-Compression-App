create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  asset_type text not null check (asset_type in ('video', 'pdf', 'google_doc', 'google_sheet', 'google_slide', 'google_drive_file', 'office_doc', 'embed')),
  source_platform text not null default 'manual',
  title text not null,
  source_url text,
  embed_url text not null,
  thumbnail_url text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists library_assets_workspace_created_idx
  on public.library_assets (workspace_id, created_at desc);

create index if not exists library_assets_workspace_archived_idx
  on public.library_assets (workspace_id, archived_at);

create unique index if not exists library_assets_workspace_embed_unique_idx
  on public.library_assets (workspace_id, embed_url)
  where archived_at is null;

alter table public.library_assets enable row level security;
alter table public.library_assets force row level security;

revoke all on public.library_assets from anon;
grant select, insert, update, delete on public.library_assets to authenticated;
grant select, insert, update, delete on public.library_assets to service_role;

drop policy if exists "Workspace members can manage library assets" on public.library_assets;
create policy "Workspace members can manage library assets"
  on public.library_assets
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create trigger library_assets_touch_updated_at
before update on public.library_assets
for each row execute function public.touch_updated_at();

alter table public.journey_assets
  add column if not exists library_asset_id uuid references public.library_assets(id) on delete set null;

create index if not exists journey_assets_library_asset_idx
  on public.journey_assets (library_asset_id)
  where library_asset_id is not null;
