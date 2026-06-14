alter table public.journeys
  add column if not exists deleted_at timestamptz;

create index if not exists journeys_workspace_deleted_idx
  on public.journeys (workspace_id, deleted_at);
