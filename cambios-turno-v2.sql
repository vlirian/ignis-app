begin;

alter table public.shift_change_requests
  add column if not exists requester_name text,
  add column if not exists requester_shift text,
  add column if not exists partner_name text,
  add column if not exists requester_signature_url text,
  add column if not exists partner_signature_url text;

alter table public.shift_change_requests
  drop constraint if exists shift_change_requests_requester_shift_check;

alter table public.shift_change_requests
  add constraint shift_change_requests_requester_shift_check
  check (requester_shift in ('A','B','C','D') or requester_shift is null);

create index if not exists idx_shift_change_requester_name on public.shift_change_requests(lower(coalesce(requester_name, '')));
create index if not exists idx_shift_change_partner_name on public.shift_change_requests(lower(coalesce(partner_name, '')));

commit;
