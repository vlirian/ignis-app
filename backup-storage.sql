begin;

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

drop policy if exists "backups_select_admin" on storage.objects;
create policy "backups_select_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'backups'
  and public.app_is_admin()
);

drop policy if exists "backups_insert_admin" on storage.objects;
create policy "backups_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'backups'
  and public.app_is_admin()
);

drop policy if exists "backups_update_admin" on storage.objects;
create policy "backups_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'backups'
  and public.app_is_admin()
)
with check (
  bucket_id = 'backups'
  and public.app_is_admin()
);

drop policy if exists "backups_delete_admin" on storage.objects;
create policy "backups_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'backups'
  and public.app_is_admin()
);

commit;
