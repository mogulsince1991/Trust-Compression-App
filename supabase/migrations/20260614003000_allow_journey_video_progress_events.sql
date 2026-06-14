alter table public.journey_views
  drop constraint if exists journey_views_event_type_check;

alter table public.journey_views
  add constraint journey_views_event_type_check
  check (event_type in ('opened', 'video_started', 'video_completed', 'video_progress', 'cta_clicked'));
