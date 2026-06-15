-- RLS policies across workspace-owned tables call this helper to verify
-- the current signed-in user belongs to the workspace. Anonymous users should
-- not be able to execute it directly, but authenticated users need EXECUTE so
-- policy evaluation can succeed.

revoke execute on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
