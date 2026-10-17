-- Applied through Supabase MCP; filename matches the recorded migration version.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-photos', 'library-photos', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create index if not exists library_assets_photo_key_idx
on public.library_assets ((metadata->>'photoKey'))
where metadata->>'photoKey' is not null;
