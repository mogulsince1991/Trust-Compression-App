alter table public.videos
  add column if not exists source_id uuid references public.sources(id) on delete set null,
  add column if not exists external_id text,
  add column if not exists embed_url text,
  add column if not exists published_at timestamptz,
  add column if not exists metadata jsonb not null default '{}';

create unique index if not exists videos_workspace_platform_external_idx
  on public.videos (workspace_id, source_platform, external_id)
  where external_id is not null;

create index if not exists videos_source_id_idx on public.videos (source_id);
create index if not exists sources_workspace_platform_idx on public.sources (workspace_id, platform);
