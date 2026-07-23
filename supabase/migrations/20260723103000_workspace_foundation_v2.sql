alter table public.workspaces
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.workspace_members
  add column if not exists updated_at timestamptz not null default now();

update public.workspaces w
set created_by = (
  select wm.user_id
  from public.workspace_members wm
  where wm.workspace_id = w.id
  order by case when wm.role = 'owner' then 0 else 1 end, wm.created_at
  limit 1
)
where w.created_by is null;

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'member', 'sales_rep', 'library_manager', 'viewer'));

create or replace function public.is_workspace_manager(target_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_workspace_manager(uuid) from public, anon;
grant execute on function public.is_workspace_manager(uuid) to authenticated, service_role;

drop policy if exists "members manage workspace invites" on public.workspace_invites;
drop policy if exists "workspace managers manage invites" on public.workspace_invites;
create policy "workspace managers manage invites"
on public.workspace_invites
for all
to authenticated
using (public.is_workspace_manager(workspace_id))
with check (public.is_workspace_manager(workspace_id));

alter policy "signed in users can read own pending invites"
on public.workspace_invites
to authenticated;

drop policy if exists "workspace managers update workspaces" on public.workspaces;
create policy "workspace managers update workspaces"
on public.workspaces
for update
to authenticated
using (public.is_workspace_manager(id))
with check (public.is_workspace_manager(id));

drop policy if exists "workspace managers manage members" on public.workspace_members;
create policy "workspace managers manage members"
on public.workspace_members
for all
to authenticated
using (public.is_workspace_manager(workspace_id))
with check (public.is_workspace_manager(workspace_id));

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invite_record public.workspace_invites%rowtype;
  member_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invite_record
  from public.workspace_invites
  where token = invite_token
    and status = 'pending'
    and expires_at > now()
    and lower(email) = lower(auth.email())
  limit 1;

  if invite_record.id is null then
    raise exception 'Invite is invalid or expired';
  end if;

  member_role := case
    when invite_record.role = 'owner' then 'admin'
    when invite_record.role in ('admin', 'member', 'sales_rep', 'library_manager', 'viewer') then invite_record.role
    else 'member'
  end;

  insert into public.workspace_members (workspace_id, user_id, role, updated_at)
  values (invite_record.workspace_id, auth.uid(), member_role, now())
  on conflict (workspace_id, user_id)
  do update set role = excluded.role, updated_at = now();

  update public.workspace_invites
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where id = invite_record.id;

  return invite_record.workspace_id;
end;
$$;

revoke all on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.accept_workspace_invite(text) to authenticated, service_role;

revoke insert, update, delete on public.workspaces from authenticated;
revoke insert, update, delete on public.workspace_members from authenticated;
revoke insert, update, delete on public.workspace_invites from authenticated;

grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select on public.workspace_invites to authenticated;

