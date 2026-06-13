drop policy if exists "Workspace members can read videos" on public.videos;
create policy "Workspace members can read videos"
  on public.videos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = videos.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can insert videos" on public.videos;
create policy "Workspace members can insert videos"
  on public.videos
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = videos.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can update videos" on public.videos;
create policy "Workspace members can update videos"
  on public.videos
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = videos.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = videos.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can read journeys" on public.journeys;
create policy "Workspace members can read journeys"
  on public.journeys
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = journeys.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can insert journeys" on public.journeys;
create policy "Workspace members can insert journeys"
  on public.journeys
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = journeys.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can update journeys" on public.journeys;
create policy "Workspace members can update journeys"
  on public.journeys
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = journeys.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = journeys.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can read journey videos" on public.journey_videos;
create policy "Workspace members can read journey videos"
  on public.journey_videos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_videos.journey_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can insert journey videos" on public.journey_videos;
create policy "Workspace members can insert journey videos"
  on public.journey_videos
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_videos.journey_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can update journey videos" on public.journey_videos;
create policy "Workspace members can update journey videos"
  on public.journey_videos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_videos.journey_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.journeys j
      join public.workspace_members wm on wm.workspace_id = j.workspace_id
      where j.id = journey_videos.journey_id
        and wm.user_id = auth.uid()
    )
  );
