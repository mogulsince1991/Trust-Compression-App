-- Allows a signed-in user to create or retrieve their first workspace.
-- Applied to Supabase project boswlaonbdxugkocquzv on 2026-06-06.

create or replace function public.ensure_workspace(workspace_name text default 'Acme Remodel')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  existing_workspace_id uuid;
  new_workspace_id uuid;
  base_slug text;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select wm.workspace_id
    into existing_workspace_id
  from public.workspace_members wm
  where wm.user_id = current_user_id
  order by wm.created_at asc
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  base_slug := lower(regexp_replace(coalesce(nullif(workspace_name, ''), 'Trust Library'), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'trust-library';
  end if;

  insert into public.workspaces (name, slug)
  values (coalesce(nullif(workspace_name, ''), 'Trust Library'), base_slug || '-' || substr(current_user_id::text, 1, 8))
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  return new_workspace_id;
end;
$$;

revoke all on function public.ensure_workspace(text) from public;
revoke execute on function public.ensure_workspace(text) from anon;
grant execute on function public.ensure_workspace(text) to authenticated;
