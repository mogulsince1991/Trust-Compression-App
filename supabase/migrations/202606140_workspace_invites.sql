create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'sales_rep', 'library_manager', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token text unique not null default encode(gen_random_bytes(18), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email, status)
);

create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id, created_at desc);
create index if not exists workspace_invites_token_idx on public.workspace_invites (token);
create index if not exists workspace_invites_email_idx on public.workspace_invites (lower(email));

alter table public.workspace_invites enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_invites' and policyname = 'members manage workspace invites') then
    create policy "members manage workspace invites" on public.workspace_invites for all
      using (public.is_workspace_member(workspace_id))
      with check (public.is_workspace_member(workspace_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workspace_invites' and policyname = 'signed in users can read own pending invites') then
    create policy "signed in users can read own pending invites" on public.workspace_invites for select
      using (auth.email() is not null and lower(email) = lower(auth.email()) and status = 'pending' and expires_at > now());
  end if;
end $$;

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record public.workspace_invites%rowtype;
  member_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into invite_record
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
    when invite_record.role in ('owner', 'admin') then 'admin'
    else 'member'
  end;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invite_record.workspace_id, auth.uid(), member_role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  update public.workspace_invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = invite_record.id;

  return invite_record.workspace_id;
end;
$$;
