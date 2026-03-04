-- Bucket + políticas para PDFs de calles (Ruta más rápida)
-- Ejecuta este SQL en Supabase SQL Editor

-- 1) Crear bucket público
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pdfs-calles',
  'pdfs-calles',
  true,
  52428800,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Lectura pública de PDFs
drop policy if exists "Public read pdfs-calles" on storage.objects;
create policy "Public read pdfs-calles"
on storage.objects
for select
to public
using (bucket_id = 'pdfs-calles');

-- 3) Escritura sólo para usuarios autenticados
drop policy if exists "Authenticated upload pdfs-calles" on storage.objects;
create policy "Authenticated upload pdfs-calles"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'pdfs-calles');

drop policy if exists "Authenticated update pdfs-calles" on storage.objects;
create policy "Authenticated update pdfs-calles"
on storage.objects
for update
to authenticated
using (bucket_id = 'pdfs-calles')
with check (bucket_id = 'pdfs-calles');

drop policy if exists "Authenticated delete pdfs-calles" on storage.objects;
create policy "Authenticated delete pdfs-calles"
on storage.objects
for delete
to authenticated
using (bucket_id = 'pdfs-calles');

