alter table public.journeys
  add column if not exists heading text,
  add column if not exists cta_label text,
  add column if not exists cta_url text,
  add column if not exists theme text not null default 'immersive',
  add column if not exists published_at timestamptz;

alter table public.videos
  add column if not exists sales_category text,
  add column if not exists funnel_stage text,
  add column if not exists transcript_status text not null default 'pending';

create index if not exists journeys_share_token_public_idx on public.journeys (share_token, is_public);
create index if not exists journey_videos_journey_position_idx on public.journey_videos (journey_id, position);
create index if not exists videos_workspace_sales_category_idx on public.videos (workspace_id, sales_category);
