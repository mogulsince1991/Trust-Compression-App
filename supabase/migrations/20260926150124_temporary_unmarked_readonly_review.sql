-- Dedicated, non-inheriting read role. Never grant authenticated/service_role to it.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'tt_reviewer') then
    create role tt_reviewer nologin noinherit;
  end if;
end $$;
grant tt_reviewer to authenticator;
grant usage on schema public, auth to tt_reviewer;
grant execute on function auth.uid() to tt_reviewer;

create table public.review_access (
  singleton boolean primary key default true check (singleton),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid unique references auth.users(id) on delete set null,
  enabled_by uuid references auth.users(id),
  enabled_at timestamptz,
  expires_at timestamptz not null default '-infinity',
  revoked_at timestamptz
);
alter table public.review_access enable row level security;
revoke all on public.review_access from public, anon, authenticated, tt_reviewer;
grant all on public.review_access to service_role;
-- Deliberately pin this installation to the uniquely named Unmarked workspace.
insert into public.review_access (workspace_id)
values ((select id from public.workspaces where name = 'Unmarked Space'));

create schema if not exists private;
grant usage on schema private to tt_reviewer;
create function private.review_can_read(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.review_access r
    where r.user_id = auth.uid() and r.workspace_id = target_workspace
      and r.revoked_at is null and r.expires_at > now()
  );
$$;
revoke all on function private.review_can_read(uuid) from public, anon, authenticated;
grant execute on function private.review_can_read(uuid) to tt_reviewer;

do $$
declare tab text; predicate text;
begin
  foreach tab in array array['workspaces','workspace_members','videos','sources','journeys','journey_assets','journey_videos','journey_views','journey_folders','library_assets','contacts','tracking_links','tracking_events','tracking_identities','social_profiles'] loop
    predicate := case
      when tab = 'workspaces' then 'private.review_can_read(id)'
      when tab in ('journey_assets','journey_videos','journey_views') then 'exists (select 1 from public.journeys j where j.id = journey_id and private.review_can_read(j.workspace_id))'
      else 'private.review_can_read(workspace_id)' end;
    execute format('grant select on public.%I to tt_reviewer', tab);
    execute format('create policy review_read on public.%I for select to tt_reviewer using (%s)', tab, predicate);
    -- Existing PUBLIC read policies cannot widen review access or bypass expiry.
    execute format('create policy review_boundary on public.%I as restrictive for select to tt_reviewer using (%s)', tab, predicate);
  end loop;
end $$;
grant execute on function public.is_workspace_member(uuid) to tt_reviewer;
grant execute on function public.is_workspace_manager(uuid) to tt_reviewer;

-- This RPC is only callable by the server's service role after an admin check.
-- It changes only a newly-created, marked review user, never a normal account.
create function public.activate_review_access(review_user uuid, administrator uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare current_grant public.review_access%rowtype; cutoff timestamptz := now() + interval '4 hours';
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server access required'; end if;
  if not exists (select 1 from public.platform_admins where user_id = administrator and active and role = 'super_admin') then
    raise exception 'Super administrator required';
  end if;
  if not exists (select 1 from auth.users where id = review_user and raw_app_meta_data->>'review_account' = 'true' and created_at > now() - interval '5 minutes')
     or exists (select 1 from public.workspace_members where user_id = review_user) then
    raise exception 'A new dedicated review user is required';
  end if;
  select * into strict current_grant from public.review_access where singleton for update;
  delete from public.workspace_members where user_id = current_grant.user_id;
  update auth.users set role = 'tt_reviewer', raw_app_meta_data = raw_app_meta_data || jsonb_build_object('review_expires_at',cutoff,'review_workspace_id',current_grant.workspace_id) where id = review_user;
  insert into public.workspace_members (workspace_id,user_id,role) values (current_grant.workspace_id,review_user,'viewer');
  update public.review_access set user_id=review_user,enabled_by=administrator,enabled_at=now(),expires_at=cutoff,revoked_at=null where singleton;
  return cutoff;
end $$;
revoke all on function public.activate_review_access(uuid,uuid) from public, anon, authenticated, tt_reviewer;
grant execute on function public.activate_review_access(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
