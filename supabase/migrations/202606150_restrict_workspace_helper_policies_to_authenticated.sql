-- Workspace helper policies should not execute for anonymous public-share viewers.
-- Keep public share reads public, but run is_workspace_member only for signed-in users.

alter policy "members can manage ai jobs" on public.ai_jobs to authenticated;
alter policy "members manage contacts" on public.contacts to authenticated;
alter policy "members manage duplicate candidates" on public.duplicate_candidates to authenticated;
alter policy "members manage journey folders" on public.journey_folders to authenticated;
alter policy "members manage journey sends" on public.journey_sends to authenticated;
alter policy "members can manage journey videos" on public.journey_videos to authenticated;
alter policy "members can read journey views" on public.journey_views to authenticated;
alter policy "members can manage journeys" on public.journeys to authenticated;
alter policy "members can manage prospects" on public.prospects to authenticated;
alter policy "members manage source sync runs" on public.source_sync_runs to authenticated;
alter policy "members can manage sources" on public.sources to authenticated;
alter policy "members manage video source links" on public.video_source_links to authenticated;
alter policy "members can manage videos" on public.videos to authenticated;
alter policy "members manage workspace invites" on public.workspace_invites to authenticated;
alter policy "members can read members" on public.workspace_members to authenticated;
alter policy "members can read workspaces" on public.workspaces to authenticated;

alter policy "public can read shared journey videos" on public.videos
  to public
  using (
    exists (
      select 1
      from public.journey_videos jv
      join public.journeys j on j.id = jv.journey_id
      where jv.video_id = videos.id
        and j.is_public = true
    )
  );
