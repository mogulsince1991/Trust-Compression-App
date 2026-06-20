create table if not exists public.contractor_metric_rule_sets (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  version integer not null default 1,
  description text,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  providers jsonb not null default '[]'::jsonb,
  global_filters jsonb not null default '[]'::jsonb,
  classifications jsonb not null default '{}'::jsonb,
  metric_definitions jsonb not null default '[]'::jsonb,
  grouped_metric_sets jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contractor_reports
  add column if not exists rule_set_id uuid references public.contractor_metric_rule_sets(id) on delete set null,
  add column if not exists rules_snapshot jsonb not null default '{}'::jsonb;

create table if not exists public.contractor_report_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_set_id uuid references public.contractor_metric_rule_sets(id) on delete set null,
  contractor_report_id uuid references public.contractor_reports(id) on delete set null,
  start_date date not null,
  end_date date not null,
  status text not null default 'completed' check (status in ('started', 'completed', 'error')),
  source_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  rules_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists contractor_metric_rule_sets_workspace_slug_idx
  on public.contractor_metric_rule_sets(workspace_id, slug);
create index if not exists contractor_metric_rule_sets_workspace_updated_idx
  on public.contractor_metric_rule_sets(workspace_id, updated_at desc);
create index if not exists contractor_reports_rule_set_idx
  on public.contractor_reports(rule_set_id, created_at desc);
create index if not exists contractor_report_runs_workspace_created_idx
  on public.contractor_report_runs(workspace_id, created_at desc);

drop trigger if exists contractor_metric_rule_sets_touch_updated_at on public.contractor_metric_rule_sets;
create trigger contractor_metric_rule_sets_touch_updated_at
  before update on public.contractor_metric_rule_sets
  for each row execute function public.touch_updated_at();

alter table public.contractor_metric_rule_sets enable row level security;
alter table public.contractor_metric_rule_sets force row level security;
alter table public.contractor_report_runs enable row level security;
alter table public.contractor_report_runs force row level security;

revoke all on public.contractor_metric_rule_sets from anon;
revoke all on public.contractor_report_runs from anon;

grant select, insert, update, delete on public.contractor_metric_rule_sets to authenticated;
grant select, insert, update, delete on public.contractor_metric_rule_sets to service_role;
grant select, insert, update, delete on public.contractor_report_runs to authenticated;
grant select, insert, update, delete on public.contractor_report_runs to service_role;

drop policy if exists "Workspace members can read contractor rule sets" on public.contractor_metric_rule_sets;
create policy "Workspace members can read contractor rule sets"
  on public.contractor_metric_rule_sets
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can write contractor rule sets" on public.contractor_metric_rule_sets;
create policy "Workspace members can write contractor rule sets"
  on public.contractor_metric_rule_sets
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update contractor rule sets" on public.contractor_metric_rule_sets;
create policy "Workspace members can update contractor rule sets"
  on public.contractor_metric_rule_sets
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can delete contractor rule sets" on public.contractor_metric_rule_sets;
create policy "Workspace members can delete contractor rule sets"
  on public.contractor_metric_rule_sets
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can read contractor report runs" on public.contractor_report_runs;
create policy "Workspace members can read contractor report runs"
  on public.contractor_report_runs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can write contractor report runs" on public.contractor_report_runs;
create policy "Workspace members can write contractor report runs"
  on public.contractor_report_runs
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can update contractor report runs" on public.contractor_report_runs;
create policy "Workspace members can update contractor report runs"
  on public.contractor_report_runs
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can delete contractor report runs" on public.contractor_report_runs;
create policy "Workspace members can delete contractor report runs"
  on public.contractor_report_runs
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));