-- Source-controlled reference for the Trust Library MVP schema.
-- Applied to Supabase project boswlaonbdxugkocquzv.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'sales_rep', 'library_manager')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  source_platform text not null default 'manual',
  source_url text,
  thumbnail_url text,
  duration_seconds integer,
  transcript text,
  summary text,
  suggested_use text,
  proof_type text,
  buying_stage text,
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text,
  service_interest text,
  buying_stage text,
  notes text,
  primary_objection text,
  goal text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  title text not null,
  description text,
  cover_url text,
  share_token text unique not null default encode(gen_random_bytes(18), 'hex'),
  is_public boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journey_videos (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null,
  note text,
  created_at timestamptz not null default now(),
  unique (journey_id, video_id),
  unique (journey_id, position)
);

create table if not exists public.journey_views (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  event_type text not null check (event_type in ('opened', 'video_started', 'video_completed', 'cta_clicked')),
  viewer_label text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null,
  account_label text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'syncing', 'error')),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  job_type text not null check (job_type in ('summarize_video', 'tag_video', 'recommend_journey')),
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'error')),
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
