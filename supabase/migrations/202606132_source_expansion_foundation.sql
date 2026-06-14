alter table public.videos
  add column if not exists deleted_at timestamptz;

alter table public.sources
  add column if not exists error text;

create table if not exists public.video_source_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  platform text not null,
  external_id text,
  source_url text,
  canonical_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id),
  unique (workspace_id, source_url)
);

create table if not exists public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'complete', 'error')),
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_duplicate_count integer not null default 0,
  duplicate_candidate_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  existing_video_id uuid not null references public.videos(id) on delete cascade,
  candidate_video_id uuid references public.videos(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  reason text not null,
  confidence numeric not null default 0.5,
  status text not null default 'review' check (status in ('review', 'merged', 'kept', 'dismissed')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.journey_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.journey_folders(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, parent_id, name)
);

alter table public.journeys
  add column if not exists folder_id uuid references public.journey_folders(id) on delete set null;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  email text,
  phone text,
  company text,
  crm_source text,
  external_id text,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, crm_source, external_id),
  unique (workspace_id, email)
);

create table if not exists public.journey_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  share_token text unique not null default encode(gen_random_bytes(18), 'hex'),
  sent_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists videos_workspace_deleted_idx on public.videos (workspace_id, deleted_at);
create index if not exists video_source_links_video_idx on public.video_source_links (video_id);
create index if not exists duplicate_candidates_workspace_status_idx on public.duplicate_candidates (workspace_id, status);
create index if not exists source_sync_runs_source_idx on public.source_sync_runs (source_id, started_at desc);
create index if not exists journey_folders_workspace_parent_idx on public.journey_folders (workspace_id, parent_id);
create index if not exists contacts_workspace_email_idx on public.contacts (workspace_id, email);
create index if not exists journey_sends_token_idx on public.journey_sends (share_token);

alter table public.video_source_links enable row level security;
alter table public.source_sync_runs enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.journey_folders enable row level security;
alter table public.contacts enable row level security;
alter table public.journey_sends enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_source_links' and policyname = 'members manage video source links') then
    create policy "members manage video source links" on public.video_source_links for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'source_sync_runs' and policyname = 'members manage source sync runs') then
    create policy "members manage source sync runs" on public.source_sync_runs for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'duplicate_candidates' and policyname = 'members manage duplicate candidates') then
    create policy "members manage duplicate candidates" on public.duplicate_candidates for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'journey_folders' and policyname = 'members manage journey folders') then
    create policy "members manage journey folders" on public.journey_folders for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacts' and policyname = 'members manage contacts') then
    create policy "members manage contacts" on public.contacts for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'journey_sends' and policyname = 'members manage journey sends') then
    create policy "members manage journey sends" on public.journey_sends for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'journey_sends' and policyname = 'public can read journey send by token') then
    create policy "public can read journey send by token" on public.journey_sends for select using (
      exists (select 1 from public.journeys j where j.id = journey_sends.journey_id and j.is_public = true)
    );
  end if;
end $$;
