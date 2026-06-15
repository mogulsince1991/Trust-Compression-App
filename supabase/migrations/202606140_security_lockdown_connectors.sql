-- Lock down OAuth connector tables.
-- These tables may contain access/refresh tokens and must never be directly
-- readable or writable from browser clients.

alter table public.connected_accounts enable row level security;
alter table public.connected_accounts force row level security;
alter table public.connector_oauth_states enable row level security;
alter table public.connector_oauth_states force row level security;

revoke all on table public.connected_accounts from anon, authenticated;
revoke all on table public.connector_oauth_states from anon, authenticated;

drop policy if exists "deny direct client access" on public.connected_accounts;
drop policy if exists "deny direct client access" on public.connector_oauth_states;

create policy "deny direct client access"
  on public.connected_accounts
  for all
  to public
  using (false)
  with check (false);

create policy "deny direct client access"
  on public.connector_oauth_states
  for all
  to public
  using (false)
  with check (false);

-- Remove public RPC access from security-definer helpers that should not be
-- directly callable through the REST API.
revoke execute on function public.accept_workspace_invite(text) from public;
revoke execute on function public.accept_workspace_invite(text) from anon, authenticated;

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.is_workspace_member(uuid) from anon, authenticated;

revoke execute on function public.ensure_workspace(text) from public;
revoke execute on function public.ensure_workspace(text) from anon;
grant execute on function public.ensure_workspace(text) to authenticated;
