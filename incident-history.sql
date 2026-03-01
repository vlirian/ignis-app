begin;

create table if not exists public.incident_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('opened', 'resolved')),
  report_date date,
  bombero_id integer,
  unit_id integer not null,
  item_id text,
  zone text,
  item text,
  note text,
  source text,
  changed_by text
);

create index if not exists idx_incident_history_created_at on public.incident_history(created_at desc);
create index if not exists idx_incident_history_unit on public.incident_history(unit_id);
create index if not exists idx_incident_history_event on public.incident_history(event_type);

alter table public.incident_history enable row level security;

grant usage on schema public to authenticated;
grant select on table public.incident_history to authenticated;

drop policy if exists "incident_history_select_auth" on public.incident_history;
create policy "incident_history_select_auth"
  on public.incident_history
  for select
  to authenticated
  using (true);

create or replace function public.log_revision_report_incident_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Inserción: todo lo nuevo son incidencias abiertas
  if tg_op = 'INSERT' then
    insert into public.incident_history (
      event_type, report_date, bombero_id, unit_id, item_id, zone, item, note, source, changed_by
    )
    select
      'opened',
      new.report_date,
      new.bombero_id,
      new.unit_id,
      coalesce(inc ->> 'itemId', null),
      inc ->> 'zone',
      inc ->> 'item',
      inc ->> 'note',
      inc ->> 'source',
      new.reviewed_by
    from jsonb_array_elements(coalesce(new.incidents, '[]'::jsonb)) inc
    where coalesce(trim(inc ->> 'item'), '') <> '';

    return new;
  end if;

  -- Borrado: todo lo anterior se considera resuelto/cerrado
  if tg_op = 'DELETE' then
    insert into public.incident_history (
      event_type, report_date, bombero_id, unit_id, item_id, zone, item, note, source, changed_by
    )
    select
      'resolved',
      old.report_date,
      old.bombero_id,
      old.unit_id,
      coalesce(inc ->> 'itemId', null),
      inc ->> 'zone',
      inc ->> 'item',
      inc ->> 'note',
      inc ->> 'source',
      old.reviewed_by
    from jsonb_array_elements(coalesce(old.incidents, '[]'::jsonb)) inc
    where coalesce(trim(inc ->> 'item'), '') <> '';

    return old;
  end if;

  -- Update: detectar altas y bajas comparando clave lógica zone+item(+itemId)
  if tg_op = 'UPDATE' then
    with old_set as (
      select
        lower(trim(coalesce(inc ->> 'zone', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'item', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'itemId', ''))) as k,
        inc
      from jsonb_array_elements(coalesce(old.incidents, '[]'::jsonb)) inc
      where coalesce(trim(inc ->> 'item'), '') <> ''
    ),
    new_set as (
      select
        lower(trim(coalesce(inc ->> 'zone', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'item', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'itemId', ''))) as k,
        inc
      from jsonb_array_elements(coalesce(new.incidents, '[]'::jsonb)) inc
      where coalesce(trim(inc ->> 'item'), '') <> ''
    )
    insert into public.incident_history (
      event_type, report_date, bombero_id, unit_id, item_id, zone, item, note, source, changed_by
    )
    select
      'opened',
      new.report_date,
      new.bombero_id,
      new.unit_id,
      coalesce(ns.inc ->> 'itemId', null),
      ns.inc ->> 'zone',
      ns.inc ->> 'item',
      ns.inc ->> 'note',
      ns.inc ->> 'source',
      new.reviewed_by
    from new_set ns
    left join old_set os on os.k = ns.k
    where os.k is null;

    with old_set as (
      select
        lower(trim(coalesce(inc ->> 'zone', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'item', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'itemId', ''))) as k,
        inc
      from jsonb_array_elements(coalesce(old.incidents, '[]'::jsonb)) inc
      where coalesce(trim(inc ->> 'item'), '') <> ''
    ),
    new_set as (
      select
        lower(trim(coalesce(inc ->> 'zone', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'item', ''))) || '|' ||
        lower(trim(coalesce(inc ->> 'itemId', ''))) as k,
        inc
      from jsonb_array_elements(coalesce(new.incidents, '[]'::jsonb)) inc
      where coalesce(trim(inc ->> 'item'), '') <> ''
    )
    insert into public.incident_history (
      event_type, report_date, bombero_id, unit_id, item_id, zone, item, note, source, changed_by
    )
    select
      'resolved',
      coalesce(new.report_date, old.report_date),
      coalesce(new.bombero_id, old.bombero_id),
      coalesce(new.unit_id, old.unit_id),
      coalesce(os.inc ->> 'itemId', null),
      os.inc ->> 'zone',
      os.inc ->> 'item',
      os.inc ->> 'note',
      os.inc ->> 'source',
      coalesce(new.reviewed_by, old.reviewed_by)
    from old_set os
    left join new_set ns on ns.k = os.k
    where ns.k is null;

    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_revision_reports_incident_history on public.revision_reports;
create trigger trg_revision_reports_incident_history
after insert or update or delete on public.revision_reports
for each row
execute function public.log_revision_report_incident_changes();

commit;

