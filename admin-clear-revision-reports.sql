begin;

create or replace function public.admin_clear_revision_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if not public.app_is_admin() then
    raise exception 'not_admin';
  end if;

  delete from public.revision_reports
  where reviewed_by is distinct from 'unidades';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.admin_clear_revision_reports() from public;
grant execute on function public.admin_clear_revision_reports() to authenticated;

commit;

