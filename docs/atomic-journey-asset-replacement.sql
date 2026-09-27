create policy "Workspace members can delete journey assets" on public.journey_assets for delete to authenticated using (exists (select 1 from public.journeys j join public.workspace_members wm on wm.workspace_id=j.workspace_id where j.id=journey_assets.journey_id and wm.user_id=auth.uid()));
create or replace function public.replace_journey_assets(p_journey_id uuid, p_workspace_id uuid, p_assets jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=auth.uid()) then raise exception 'Workspace access required'; end if;
 perform 1 from public.journeys where id=p_journey_id and workspace_id=p_workspace_id and deleted_at is null for update;
 if not found then raise exception 'Journey unavailable'; end if;
 if jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets)=0 then raise exception 'Add at least one item'; end if;
 if exists(select 1 from jsonb_to_recordset(p_assets) as a(video_id uuid,library_asset_id uuid) where (a.video_id is not null and not exists(select 1 from public.videos v where v.id=a.video_id and v.workspace_id=p_workspace_id)) or (a.library_asset_id is not null and not exists(select 1 from public.library_assets l where l.id=a.library_asset_id and l.workspace_id=p_workspace_id))) then raise exception 'Content must belong to this workspace'; end if;
 delete from public.journey_assets where journey_id=p_journey_id;
 insert into public.journey_assets(journey_id,library_asset_id,video_id,asset_type,source_platform,title,source_url,embed_url,thumbnail_url,summary,note,metadata,position)
 select p_journey_id,a.library_asset_id,a.video_id,a.asset_type,a.source_platform,a.title,a.source_url,a.embed_url,a.thumbnail_url,a.summary,a.note,coalesce(a.metadata,'{}'::jsonb),a.position
 from jsonb_to_recordset(p_assets) as a(library_asset_id uuid,video_id uuid,asset_type text,source_platform text,title text,source_url text,embed_url text,thumbnail_url text,summary text,note text,metadata jsonb,position integer);
 update public.journeys set cover_url=p_assets->0->>'thumbnail_url',updated_at=now() where id=p_journey_id and workspace_id=p_workspace_id;
end; $$;
revoke all on function public.replace_journey_assets(uuid,uuid,jsonb) from public,anon;
grant execute on function public.replace_journey_assets(uuid,uuid,jsonb) to authenticated;
