do $$
declare t text;
begin
 foreach t in array array['contractor_connector_cache','contractor_data_sources','contractor_jobs','contractor_leads','contractor_metric_rule_sets','contractor_report_runs','contractor_reports','contractor_spend_rows','contractor_sync_runs']
 loop
 execute format('alter table public.%I enable row level security', t);
 execute format('create policy reporting_launch_entitlement on public.%I as restrictive for all to authenticated, anon using (workspace_id = %L::uuid) with check (workspace_id = %L::uuid)',t,'bef4c5ad-5ead-4f2a-934c-f1238f614589','bef4c5ad-5ead-4f2a-934c-f1238f614589');
 end loop;
end $$;
alter view public.contractor_latest_reports set (security_invoker = true);
update public.contractor_metric_rule_sets set name='Default Report' where name='Default Contractor Report';
