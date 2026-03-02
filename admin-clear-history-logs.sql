begin;

-- Permitir borrado solo a administradores en historial de incidencias.
grant delete on table public.incident_history to authenticated;

drop policy if exists "incident_history_delete_admin" on public.incident_history;
create policy "incident_history_delete_admin"
  on public.incident_history
  for delete
  to authenticated
  using (public.app_is_admin());

-- Permitir borrado solo a administradores en registro de inventario.
grant delete on table public.inventory_change_log to authenticated;

drop policy if exists "inventory_change_log_delete_admin" on public.inventory_change_log;
create policy "inventory_change_log_delete_admin"
  on public.inventory_change_log
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
