-- Keep historical snapshots intact, but expose only the latest run per workspace/date range.
create or replace view public.contractor_latest_reports
with (security_invoker = true) as
select distinct on (workspace_id, start_date, end_date) *
from public.contractor_reports
order by workspace_id, start_date, end_date, created_at desc, id desc;
revoke all on public.contractor_latest_reports from anon;
grant select on public.contractor_latest_reports to authenticated;
