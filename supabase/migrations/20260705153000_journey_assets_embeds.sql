create table if not exists public.journey_assets (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  asset_type text not null check (asset_type in ('video', 'pdf', 'google_doc', 'google_sheet', 'google_slide', 'google_drive_file', 'office_doc', 'embed')),
  source_platform text not null default 'manual',
  title text not null,
  source_url text,
  embed_url text not null,
  thumbnail_url text,
  summary text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (journey_id, position)
);

create index if not exists journey_assets_journey_position_idx on public.journey_assets (journey_id, position);
create index if not exists journey_assets_video_idx on public.journey_assets (video_id) where video_id is not null;

insert into public.journey_assets (
  journey_id,
  video_id,
  asset_type,
  source_platform,
  title,
  source_url,
  embed_url,
  thumbnail_url,
  summary,
  note,
  metadata,
  position,
  created_at
)
select
  jv.journey_id,
  jv.video_id,
  'video',
  coalesce(v.source_platform, 'manual'),
  coalesce(v.title, 'Untitled video'),
  v.source_url,
  coalesce(v.embed_url, v.source_url, ''),
  v.thumbnail_url,
  v.summary,
  jv.note,
  coalesce(v.metadata, '{}'::jsonb),
  jv.position,
  jv.created_at
from public.journey_videos jv
join public.videos v on v.id = jv.video_id
where not exists (
  select 1
  from public.journey_assets ja
  where ja.journey_id = jv.journey_id
    and ja.position = jv.position
);

alter table public.journey_assets enable row level security;

drop policy if exists "Workspace members can read journey assets" on public.journey_assets;
create policy "Workspace members can read journey assets"
  on public.journey_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_assets.journey_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can insert journey assets" on public.journey_assets;
create policy "Workspace members can insert journey assets"
  on public.journey_assets
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_assets.journey_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can update journey assets" on public.journey_assets;
create policy "Workspace members can update journey assets"
  on public.journey_assets
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_assets.journey_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_assets.journey_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Public can read journey assets in shared journeys" on public.journey_assets;
create policy "Public can read journey assets in shared journeys"
  on public.journey_assets
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.journeys j
      where j.id = journey_assets.journey_id
        and j.is_public = true
    )
  );

alter table public.journey_views
  add column if not exists asset_id uuid references public.journey_assets(id) on delete set null;

alter table public.journey_views
  drop constraint if exists journey_views_event_type_check;

alter table public.journey_views
  add constraint journey_views_event_type_check
  check (event_type in ('opened', 'video_started', 'video_completed', 'video_progress', 'asset_started', 'asset_completed', 'asset_progress', 'cta_clicked'));
