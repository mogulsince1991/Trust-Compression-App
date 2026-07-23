drop policy if exists "workspace managers manage invites" on public.workspace_invites;
drop policy if exists "signed in users can read own pending invites" on public.workspace_invites;
drop policy if exists "workspace invite visibility" on public.workspace_invites;

create policy "workspace invite visibility"
on public.workspace_invites
for select
to authenticated
using (
  public.is_workspace_manager(workspace_id)
  or (
    auth.email() is not null
    and lower(email) = lower(auth.email())
    and status = 'pending'
    and expires_at > now()
  )
);

drop policy if exists "workspace managers update workspaces" on public.workspaces;
drop policy if exists "workspace managers manage members" on public.workspace_members;

