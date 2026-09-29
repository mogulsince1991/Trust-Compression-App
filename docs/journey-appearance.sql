alter table public.journeys add column if not exists appearance jsonb not null default '{}'::jsonb;
alter table public.workspaces add column if not exists journey_appearance jsonb not null default '{}'::jsonb;
