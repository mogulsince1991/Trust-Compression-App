alter table public.workspace_integration_keys
  add column if not exists allowed_phone_numbers text[] not null default '{}',
  add column if not exists require_direct_message boolean not null default true;

comment on column public.workspace_integration_keys.allowed_phone_numbers is
  'E.164 sender numbers allowed to invoke message-gated MCP tools through this connector.';

comment on column public.workspace_integration_keys.require_direct_message is
  'When true, journey mutations require message_channel=direct_message.';
