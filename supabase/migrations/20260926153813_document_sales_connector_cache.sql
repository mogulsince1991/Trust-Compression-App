create table public.contractor_connector_cache (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connector_id uuid not null references public.connected_accounts(id) on delete cascade,
 rule_version text not null,
 cache_key text not null,
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key (workspace_id, connector_id, rule_version, cache_key)
);
alter table public.contractor_connector_cache enable row level security;
alter table public.contractor_connector_cache force row level security;
revoke all on public.contractor_connector_cache from public, anon, authenticated;
grant select, insert, update, delete on public.contractor_connector_cache to service_role;
comment on table public.contractor_connector_cache is 'Server-only tenant/connector/version scoped JobTread approval history and exact-period snapshots.';
