begin;

alter table public.vehicle_incidents
  add column if not exists photo_urls text[] not null default '{}';

alter table public.installation_incidents
  add column if not exists photo_urls text[] not null default '{}';

commit;
