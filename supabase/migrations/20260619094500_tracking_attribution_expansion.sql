alter table public.tracking_events
  add column if not exists event_label text,
  add column if not exists event_value numeric(12,2),
  add column if not exists event_currency text,
  add column if not exists occurred_at timestamptz not null default now();

alter table public.tracking_events
  drop constraint if exists tracking_events_event_type_check;

alter table public.tracking_events
  add constraint tracking_events_event_type_check
  check (
    event_type in (
      'redirect',
      'page_view',
      'cta_click',
      'form_submit',
      'opt_in',
      'booking',
      'purchase',
      'custom'
    )
  );

create index if not exists tracking_events_type_occurred_idx
  on public.tracking_events (event_type, occurred_at desc);

create index if not exists tracking_events_visitor_occurred_idx
  on public.tracking_events (visitor_id, occurred_at desc)
  where visitor_id is not null;

create index if not exists tracking_events_session_occurred_idx
  on public.tracking_events (session_id, occurred_at desc)
  where session_id is not null;
