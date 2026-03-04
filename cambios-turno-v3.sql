begin;

alter table public.shift_change_requests
  add column if not exists partner_shift text,
  add column if not exists is_extra_guard boolean not null default false;

alter table public.shift_change_requests
  drop constraint if exists shift_change_requests_partner_shift_check;

alter table public.shift_change_requests
  add constraint shift_change_requests_partner_shift_check
  check (partner_shift in ('A','B','C','D') or partner_shift is null);

create index if not exists idx_shift_change_partner_shift on public.shift_change_requests(partner_shift);
create index if not exists idx_shift_change_extra_guard on public.shift_change_requests(is_extra_guard);

commit;
