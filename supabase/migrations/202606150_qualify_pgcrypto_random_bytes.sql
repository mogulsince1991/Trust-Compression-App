-- Supabase installs pgcrypto in the extensions schema. Qualify calls to
-- gen_random_bytes so API/RPC execution paths do not depend on search_path.

alter table public.journeys
  alter column share_token set default encode(extensions.gen_random_bytes(18), 'hex');

alter table public.journey_sends
  alter column share_token set default encode(extensions.gen_random_bytes(18), 'hex');

alter table public.workspace_invites
  alter column token set default encode(extensions.gen_random_bytes(18), 'hex');

create or replace function public.ensure_workspace(workspace_name text default 'Acme Remodel'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  current_user_id uuid := auth.uid();
  existing_workspace_id uuid;
  new_workspace_id uuid;
  workspace_label text;
  base_slug text;
  candidate_slug text;
  attempt integer := 0;
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

  workspace_label := coalesce(nullif(trim(workspace_name), ''), 'Trust Library');
  base_slug := lower(regexp_replace(workspace_label, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'trust-library';
  end if;

  loop
    attempt := attempt + 1;
    candidate_slug := case
      when attempt = 1 then base_slug || '-' || substr(current_user_id::text, 1, 12)
      when attempt = 2 then base_slug || '-' || replace(current_user_id::text, '-', '')
      else base_slug || '-' || encode(extensions.gen_random_bytes(6), 'hex')
    end;

    begin
      insert into public.workspaces (name, slug)
      values (workspace_label, candidate_slug)
      returning id into new_workspace_id;
      exit;
    exception
      when unique_violation then
        if attempt >= 6 then
          raise;
        end if;
    end;
  end loop;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, current_user_id, 'owner');

  return new_workspace_id;
end;
$function$;

revoke execute on function public.ensure_workspace(text) from public, anon;
grant execute on function public.ensure_workspace(text) to authenticated;
