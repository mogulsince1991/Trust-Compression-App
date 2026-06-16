create table if not exists public.contractor_data_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gohighlevel','jobtread','windsor','spend_upload','csv','manual')),
  display_name text not null,
  external_account_id text,
  status text not null default 'connected' check (status in ('connected','syncing','error','disabled')),
  settings jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid references public.contractor_data_sources(id) on delete set null,
  status text not null default 'started' check (status in ('started','success','error')),
  imported_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.contractor_leads (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid references public.contractor_data_sources(id) on delete set null,
  external_id text,
  name text,
  email text,
  phone text,
  source text,
  campaign text,
  created_date timestamptz,
  tags text[] not null default '{}'::text[],
  notes_summary text,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid references public.contractor_data_sources(id) on delete set null,
  external_id text,
  job_number text,
  customer text,
  email text,
  phone text,
  appointment_date timestamptz,
  sold_date timestamptz,
  status text,
  project_type text,
  revenue numeric(14,2) not null default 0,
  net_sales numeric(14,2) not null default 0,
  design_consultant text,
  project_manager text,
  source text,
  campaign text,
  notes_summary text,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_spend_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  data_source_id uuid references public.contractor_data_sources(id) on delete set null,
  spend_date date,
  vendor text not null,
  channel text,
  campaign text,
  spend numeric(14,2) not null default 0,
  leads integer not null default 0,
  trackable boolean not null default true,
  source_file text,
  raw jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contractor_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  client_name text,
  totals jsonb not null default '{}'::jsonb,
  breakdowns jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contractor_data_sources_workspace_idx on public.contractor_data_sources(workspace_id);
create index if not exists contractor_sync_runs_workspace_idx on public.contractor_sync_runs(workspace_id, started_at desc);
create index if not exists contractor_leads_workspace_created_idx on public.contractor_leads(workspace_id, created_date desc);
create index if not exists contractor_jobs_workspace_appt_idx on public.contractor_jobs(workspace_id, appointment_date desc);
create index if not exists contractor_jobs_workspace_sold_idx on public.contractor_jobs(workspace_id, sold_date desc);
create index if not exists contractor_spend_rows_workspace_date_idx on public.contractor_spend_rows(workspace_id, spend_date desc);
create index if not exists contractor_reports_workspace_period_idx on public.contractor_reports(workspace_id, start_date desc, end_date desc);
create unique index if not exists contractor_data_sources_unique_external_idx on public.contractor_data_sources(workspace_id, provider, external_account_id) where external_account_id is not null;
create unique index if not exists contractor_leads_unique_external_idx on public.contractor_leads(workspace_id, data_source_id, external_id) where external_id is not null;
create unique index if not exists contractor_jobs_unique_external_idx on public.contractor_jobs(workspace_id, data_source_id, external_id) where external_id is not null;

create trigger contractor_data_sources_touch_updated_at before update on public.contractor_data_sources for each row execute function public.touch_updated_at();
create trigger contractor_leads_touch_updated_at before update on public.contractor_leads for each row execute function public.touch_updated_at();
create trigger contractor_jobs_touch_updated_at before update on public.contractor_jobs for each row execute function public.touch_updated_at();
create trigger contractor_spend_rows_touch_updated_at before update on public.contractor_spend_rows for each row execute function public.touch_updated_at();

alter table public.contractor_data_sources enable row level security;
alter table public.contractor_sync_runs enable row level security;
alter table public.contractor_leads enable row level security;
alter table public.contractor_jobs enable row level security;
alter table public.contractor_spend_rows enable row level security;
alter table public.contractor_reports enable row level security;

alter table public.contractor_data_sources force row level security;
alter table public.contractor_sync_runs force row level security;
alter table public.contractor_leads force row level security;
alter table public.contractor_jobs force row level security;
alter table public.contractor_spend_rows force row level security;
alter table public.contractor_reports force row level security;

revoke all on public.contractor_data_sources from anon;
revoke all on public.contractor_sync_runs from anon;
revoke all on public.contractor_leads from anon;
revoke all on public.contractor_jobs from anon;
revoke all on public.contractor_spend_rows from anon;
revoke all on public.contractor_reports from anon;

grant select, insert, update, delete on public.contractor_data_sources to authenticated;
grant select, insert, update, delete on public.contractor_sync_runs to authenticated;
grant select, insert, update, delete on public.contractor_leads to authenticated;
grant select, insert, update, delete on public.contractor_jobs to authenticated;
grant select, insert, update, delete on public.contractor_spend_rows to authenticated;
grant select, insert, update, delete on public.contractor_reports to authenticated;

create policy "Workspace members can read contractor data sources" on public.contractor_data_sources for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor data sources" on public.contractor_data_sources for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor data sources" on public.contractor_data_sources for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor data sources" on public.contractor_data_sources for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read contractor sync runs" on public.contractor_sync_runs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor sync runs" on public.contractor_sync_runs for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor sync runs" on public.contractor_sync_runs for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor sync runs" on public.contractor_sync_runs for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read contractor leads" on public.contractor_leads for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor leads" on public.contractor_leads for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor leads" on public.contractor_leads for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor leads" on public.contractor_leads for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read contractor jobs" on public.contractor_jobs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor jobs" on public.contractor_jobs for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor jobs" on public.contractor_jobs for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor jobs" on public.contractor_jobs for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read contractor spend rows" on public.contractor_spend_rows for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor spend rows" on public.contractor_spend_rows for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor spend rows" on public.contractor_spend_rows for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor spend rows" on public.contractor_spend_rows for delete to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read contractor reports" on public.contractor_reports for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can write contractor reports" on public.contractor_reports for insert to authenticated with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can update contractor reports" on public.contractor_reports for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "Workspace members can delete contractor reports" on public.contractor_reports for delete to authenticated using (public.is_workspace_member(workspace_id));
