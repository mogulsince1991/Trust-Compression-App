revoke all on public.tracking_events from authenticated;
grant select on public.tracking_events to authenticated;

revoke all on public.tracking_events from anon;

grant select, insert, update, delete on public.tracking_events to service_role;
