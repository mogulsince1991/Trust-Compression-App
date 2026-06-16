alter table public.journeys
  alter column share_token
  set default encode(extensions.gen_random_bytes(18), 'hex');

alter table public.journey_sends
  alter column share_token
  set default encode(extensions.gen_random_bytes(18), 'hex');

alter table public.workspace_invites
  alter column token
  set default encode(extensions.gen_random_bytes(18), 'hex');
