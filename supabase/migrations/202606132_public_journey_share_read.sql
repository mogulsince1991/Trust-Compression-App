alter table public.journeys enable row level security;
alter table public.journey_videos enable row level security;
alter table public.videos enable row level security;

drop policy if exists "Public can read shared journeys" on public.journeys;
create policy "Public can read shared journeys"
  on public.journeys
  for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "Public can read videos in shared journeys" on public.journey_videos;
create policy "Public can read videos in shared journeys"
  on public.journey_videos
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.journeys j
      where j.id = journey_videos.journey_id
        and j.is_public = true
    )
  );

drop policy if exists "Public can read shared journey video records" on public.videos;
create policy "Public can read shared journey video records"
  on public.videos
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.journey_videos jv
      join public.journeys j on j.id = jv.journey_id
      where jv.video_id = videos.id
        and j.is_public = true
    )
  );
